import "server-only";

import { redirect } from "next/navigation";

import { db } from "@/server/db";
import {
  getCurrentSession,
  type SessionUser,
} from "@/server/auth";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/errors";
import { getSchoolBySlug } from "@/server/services/schools";
import type { Role } from "@/generated/prisma/client";

// Re-exported from the pure module so existing imports keep working.
export {
  PERMISSIONS,
  type Permission,
  ROLE_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  type SchoolRole,
} from "@/lib/permissions";
import {
  hasSchoolRolePermission,
  hasPlatformRolePermission,
  type Permission,
} from "@/lib/permissions";

export type MembershipSummary = {
  id: string;
  schoolId: string;
  userId: string;
  role: Role;
};

/**
 * Result of a successful tenant-access check: the authenticated user plus
 * their membership in the school (null for platform staff with no school
 * membership).
 */
export type SchoolAccess = {
  user: SessionUser;
  schoolId: string;
  membership: MembershipSummary | null;
  isPlatformStaff: boolean;
};

function hasRolePermission(user: SessionUser, permission: Permission): boolean {
  if (!user.platformRole) return false;
  return hasPlatformRolePermission(user.platformRole, permission);
}

function hasMembershipPermission(
  role: Role,
  permission: Permission
): boolean {
  return hasSchoolRolePermission(role, permission);
}

/**
 * Non-throwing lookup of the current user's membership in a school.
 * Returns null when the user is not signed in, the school does not exist, or
 * the user has no membership there. Useful for conditional UI rendering.
 */
export async function getCurrentMembership(
  slug: string
): Promise<MembershipSummary | null> {
  const session = await getCurrentSession();
  if (!session) return null;

  const school = await getSchoolBySlug(slug);
  if (!school) return null;

  return db.membership.findUnique({
    where: { schoolId_userId: { schoolId: school.id, userId: session.userId } },
    select: { id: true, schoolId: true, userId: true, role: true },
  });
}

function isPlatformStaff(user: SessionUser): boolean {
  return user.platformRole !== null;
}

function loginUrl(next?: string): string {
  return `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
}

function membershipWhere(schoolId: string, userId: string) {
  return { schoolId_userId: { schoolId, userId } };
}

async function resolveAccess(
  slug: string,
  session: { id: string; userId: string; user: SessionUser }
): Promise<SchoolAccess> {
  const school = await getSchoolBySlug(slug);
  const membership = school
    ? await db.membership.findUnique({
        where: membershipWhere(school.id, session.userId),
        select: { id: true, schoolId: true, userId: true, role: true },
      })
    : null;

  return {
    user: session.user,
    schoolId: school?.id ?? "",
    membership,
    isPlatformStaff: isPlatformStaff(session.user),
  };
}

// ---------------------------------------------------------------------------
// Redirect-based guards (React Server Components / layouts).
// Unauthenticated -> /login?next=...; no tenant access -> notFound() to avoid
// leaking which school slugs exist to users without a membership.
// ---------------------------------------------------------------------------

/**
 * Redirect to /login when no valid session exists. Returns the signed-in user
 * otherwise.
 */
export async function requireAuth(opts?: { next?: string }): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) redirect(loginUrl(opts?.next));

  const user = session.user;
  // User records are not hard-deleted in this system; sessions cascade on
  // delete, so we only need the presence check above.
  return user;
}

/**
 * Require an authenticated user with access to the given school tenant.
 * Access = a membership in the school, OR a platform role (SUPER_ADMIN /
 * SUPPORT). Prevents cross-tenant access.
 */
export async function requireSchoolAccess(
  slug: string,
  opts?: { next?: string }
): Promise<SchoolAccess> {
  const session = await getCurrentSession();
  if (!session) redirect(loginUrl(opts?.next ?? `/${slug}`));
  if (session.user.mustChangePassword) {
    redirect(`/first-login?next=${encodeURIComponent(opts?.next ?? `/${slug}`)}`);
  }

  const access = await resolveAccess(slug, session);
  if (!access.schoolId) redirect("/not-found");
  if (!access.membership && !access.isPlatformStaff) redirect("/not-found");

  return access;
}

/**
 * Require the user to hold one of the given school-scoped roles in the tenant.
 * A platform SUPER_ADMIN always passes; SUPPORT does not (use
 * `requirePermission` for capability checks).
 */
export async function requireRole(
  slug: string,
  roles: Role[],
  opts?: { next?: string }
): Promise<SchoolAccess> {
  const access = await requireSchoolAccess(slug, opts);
  if (access.user.platformRole === "SUPER_ADMIN") return access;
  if (access.membership && roles.includes(access.membership.role)) return access;

  redirect(`/${slug}`);
}

/**
 * Require a capability (permission) within the tenant. Platform roles resolve
 * against the platform matrix; school roles against the school matrix.
 */
export async function requirePermission(
  slug: string,
  permission: Permission,
  opts?: { next?: string }
): Promise<SchoolAccess> {
  const access = await requireSchoolAccess(slug, opts);

  const allowed =
    (access.isPlatformStaff &&
      hasRolePermission(access.user, permission)) ||
    (access.membership !== null &&
      hasMembershipPermission(access.membership.role, permission));

  if (!allowed) redirect(`/${slug}`);

  return access;
}

// ---------------------------------------------------------------------------
// Throw-based guards (Data Access Layer / Server Actions / Route Handlers).
// Always re-validate inside every mutation — page-level checks do NOT protect
// server actions invoked directly.
// ---------------------------------------------------------------------------

/** Throw (401) when there is no valid session; returns the user otherwise. */
export async function assertAuthenticated(): Promise<SessionUser> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  return session.user;
}

/**
 * Throw (401/403) unless the user has access to the school tenant.
 * Note: school absence and missing membership both surface as 403 to avoid
 * leaking tenant existence in non-rendering code paths.
 */
export async function assertSchoolAccess(
  slug: string
): Promise<SchoolAccess> {
  const user = await assertAuthenticated();
  const session = { id: "", userId: user.id, user };
  const access = await resolveAccess(slug, session);

  if (!access.schoolId || (!access.membership && !access.isPlatformStaff)) {
    throw new ForbiddenError("You do not have access to this school.");
  }

  return access;
}

/** Throw unless the user holds one of the given school roles in the tenant. */
export async function assertRole(
  slug: string,
  roles: Role[]
): Promise<SchoolAccess> {
  const access = await assertSchoolAccess(slug);

  const allowed =
    access.user.platformRole === "SUPER_ADMIN" ||
    (access.membership !== null && roles.includes(access.membership.role));

  if (!allowed) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }

  return access;
}

/** Throw unless the user has the given capability in the tenant. */
export async function assertPermission(
  slug: string,
  permission: Permission
): Promise<SchoolAccess> {
  const access = await assertSchoolAccess(slug);

  const allowed =
    (access.isPlatformStaff &&
      hasRolePermission(access.user, permission)) ||
    (access.membership !== null &&
      hasMembershipPermission(access.membership.role, permission));

  if (!allowed) {
    throw new ForbiddenError("You do not have permission to perform this action.");
  }

  return access;
}

/**
 * Non-throwing capability check for the tenant (safe for conditional UI).
 * Resolves the same as `assertPermission` but returns false instead of
 * throwing when the user lacks the capability or tenant access.
 */
export async function canAccess(
  slug: string,
  permission: Permission
): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;

  const access = await resolveAccess(slug, session);
  if (!access.schoolId || (!access.membership && !access.isPlatformStaff)) {
    return false;
  }

  return (
    (access.isPlatformStaff && hasRolePermission(access.user, permission)) ||
    (access.membership !== null &&
      hasMembershipPermission(access.membership.role, permission))
  );
}