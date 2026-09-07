import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma, Role, StaffRole } from "@/generated/prisma/client";

/**
 * Order-agnostic "no rows" predicate used when the caller has genuine school
 * access but no visibility of any staff (e.g. a student trying an id probe).
 */
const NONE_WHERE = { id: { equals: "__none__" } };

/**
 * Translate a viewer's school access into the Portal Role granted to a staff
 * member's Membership. Teachers and school administrators use their namesake
 * roles; every other employment category gets the generic `STAFF` role with
 * minimal permissions. This is what keeps non-teaching staff from inheriting
 * teacher/school-admin privileges.
 */
export function mappedMembershipRole(staffRole: StaffRole): Role {
  switch (staffRole) {
    case "TEACHER":
      return "TEACHER";
    case "SCHOOL_ADMIN":
      return "SCHOOL_ADMIN";
    default:
      return "STAFF";
  }
}

/**
 * Translate a viewer's school access into a Prisma `StaffWhereInput` that
 * scopes the staff profiles they are allowed to see.
 *
 * - SCHOOL_ADMIN / platform staff (SUPER_ADMIN, SUPPORT): all staff.
 * - TEACHER: only their own staff profile.
 * - STAFF: only their own staff profile.
 * - PARENT / STUDENT: no staff records.
 *
 * Every staff query in this module MUST be combined with this scope so that
 * teachers/staff/parents/students can never see each other's records.
 */
export async function staffScopeWhere(
  access: SchoolAccess
): Promise<Prisma.StaffWhereInput> {
  const { user, membership, isPlatformStaff } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") {
    return {};
  }

  if (
    membership?.role === "TEACHER" ||
    membership?.role === "STAFF"
  ) {
    return { userId: user.id };
  }

  return NONE_WHERE;
}

/**
 * Whether the viewer may view a specific staff profile in the tenant.
 * Re-checks the role scope so a teacher/staff/parent/student cannot open
 * arbitrary profiles.
 */
export async function canViewStaff(
  access: SchoolAccess,
  staffId: string
): Promise<boolean> {
  const scope = await staffScopeWhere(access);
  const match = await db.staff.findFirst({
    where: { id: staffId, schoolId: access.schoolId, ...scope },
    select: { id: true },
  });
  return match !== null;
}

/** Load a staff profile only when it belongs to the tenant (or null). */
export async function getStaffInSchool(schoolId: string, staffId: string) {
  return db.staff.findUnique({
    where: { id: staffId, schoolId },
  });
}

/** Load a staff profile by its linked user within the tenant (or null). */
export async function getStaffByUser(schoolId: string, userId: string) {
  return db.staff.findFirst({
    where: { schoolId, userId },
  });
}