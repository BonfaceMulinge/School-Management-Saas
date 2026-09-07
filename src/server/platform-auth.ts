import "server-only";

import { redirect } from "next/navigation";

import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/errors";
import { type Permission } from "@/server/authorization";
import { hasPlatformRolePermission } from "@/lib/permissions";

/**
 * Result of a successful platform-level access check.
 */
export type PlatformAccess = {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    platformRole: "SUPER_ADMIN" | "SUPPORT" | null;
  };
  isSuperAdmin: boolean;
  isSupport: boolean;
};

/**
 * Require an authenticated user with SUPER_ADMIN platform role.
 * Redirects to /login or / not-found as appropriate.
 */
export async function requireSuperAdmin(
  opts?: { next?: string }
): Promise<PlatformAccess> {
  const session = await getCurrentSession();
  if (!session) redirect(opts?.next ?? "/login");

  const { user } = session;
  if (user.platformRole !== "SUPER_ADMIN") {
    redirect("/");
  }

  return {
    user,
    isSuperAdmin: true,
    isSupport: false,
  };
}

/**
 * Require an authenticated user with SUPER_ADMIN or SUPPORT platform role.
 * Redirects to /login or / not-found as appropriate.
 */
export async function requirePlatformStaff(
  opts?: { next?: string }
): Promise<PlatformAccess> {
  const session = await getCurrentSession();
  if (!session) redirect(opts?.next ?? "/login");

  const { user } = session;
  if (user.platformRole !== "SUPER_ADMIN" && user.platformRole !== "SUPPORT") {
    redirect("/");
  }

  return {
    user,
    isSuperAdmin: user.platformRole === "SUPER_ADMIN",
    isSupport: user.platformRole === "SUPPORT",
  };
}

/**
 * Throw (401/403) unless the user has SUPER_ADMIN platform role.
 * Note: no school context required; this is a platform-level check.
 */
export async function assertSuperAdmin(): Promise<PlatformAccess> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();

  const { user } = session;
  if (user.platformRole !== "SUPER_ADMIN") {
    throw new ForbiddenError("Super admin access required.");
  }

  return {
    user,
    isSuperAdmin: true,
    isSupport: false,
  };
}

/**
 * Throw (401/403) unless the user has SUPER_ADMIN or SUPPORT platform role.
 */
export async function assertPlatformStaff(): Promise<PlatformAccess> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();

  const { user } = session;
  if (user.platformRole !== "SUPER_ADMIN" && user.platformRole !== "SUPPORT") {
    throw new ForbiddenError("Platform staff access required.");
  }

  return {
    user,
    isSuperAdmin: user.platformRole === "SUPER_ADMIN",
    isSupport: user.platformRole === "SUPPORT",
  };
}

/**
 * Check if the current user has a platform-level permission.
 * Returns false if no session or insufficient role.
 * Delegates to the single source of truth (PLATFORM_ROLE_PERMISSIONS) so this
 * never drifts from the full permission matrix.
 */
export async function canAccessPlatform(
  permission: Permission
): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;

  const { user } = session;
  if (!user.platformRole) return false;

  return hasPlatformRolePermission(user.platformRole, permission);
}

/**
 * Check if a user (by ID) is a SUPER_ADMIN.
 * Used for cross-referencing in admin UIs.
 */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return user?.platformRole === "SUPER_ADMIN";
}

/**
 * Check if a user (by ID) is platform staff (SUPER_ADMIN or SUPPORT).
 */
export async function isPlatformStaff(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { platformRole: true },
  });
  return user?.platformRole === "SUPER_ADMIN" || user?.platformRole === "SUPPORT";
}