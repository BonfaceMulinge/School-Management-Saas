import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  hasSchoolRolePermission,
  hasPlatformRolePermission,
  type Permission,
} from "@/lib/permissions";

// ---------------------------------------------------------------------------
// hasSchoolRolePermission
// ---------------------------------------------------------------------------

describe("hasSchoolRolePermission", () => {
  it("SCHOOL_ADMIN has all school permissions", () => {
    const schoolPermissions = Object.values(PERMISSIONS).filter(
      (perm) => !perm.startsWith("admin:")
    );
    for (const perm of schoolPermissions) {
      expect(
        hasSchoolRolePermission("SCHOOL_ADMIN", perm),
        `SCHOOL_ADMIN should have ${perm}`
      ).toBe(true);
    }
  });

  it("SCHOOL_ADMIN has no platform (admin:*) permissions", () => {
    const adminPermissions = Object.values(PERMISSIONS).filter((perm) =>
      perm.startsWith("admin:")
    );
    for (const perm of adminPermissions) {
      expect(hasSchoolRolePermission("SCHOOL_ADMIN", perm)).toBe(false);
    }
  });

  it("TEACHER can manage attendance but not finance or settings", () => {
    expect(hasSchoolRolePermission("TEACHER", PERMISSIONS.attendance_manage)).toBe(true);
    expect(hasSchoolRolePermission("TEACHER", PERMISSIONS.finance_manage)).toBe(false);
    expect(hasSchoolRolePermission("TEACHER", PERMISSIONS.settings_manage)).toBe(false);
  });

  it("STUDENT has only view permissions", () => {
    expect(hasSchoolRolePermission("STUDENT", PERMISSIONS.students_view)).toBe(true);
    expect(hasSchoolRolePermission("STUDENT", PERMISSIONS.finance_view)).toBe(true);
    expect(hasSchoolRolePermission("STUDENT", PERMISSIONS.finance_manage)).toBe(false);
    expect(hasSchoolRolePermission("STUDENT", PERMISSIONS.settings_view)).toBe(false);
  });

  it("PARENT can view documents but cannot send messages", () => {
    expect(hasSchoolRolePermission("PARENT", PERMISSIONS.documents_view)).toBe(true);
    expect(hasSchoolRolePermission("PARENT", PERMISSIONS.communication_send)).toBe(false);
  });

  it("STAFF has minimal access", () => {
    expect(hasSchoolRolePermission("STAFF", PERMISSIONS.dashboard_view)).toBe(true);
    expect(hasSchoolRolePermission("STAFF", PERMISSIONS.settings_view)).toBe(true);
    expect(hasSchoolRolePermission("STAFF", PERMISSIONS.students_view)).toBe(false);
    expect(hasSchoolRolePermission("STAFF", PERMISSIONS.finance_view)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPlatformRolePermission
// ---------------------------------------------------------------------------

describe("hasPlatformRolePermission", () => {
  it("SUPER_ADMIN has every permission via wildcard", () => {
    const allPermissions = Object.values(PERMISSIONS);
    for (const perm of allPermissions) {
      expect(
        hasPlatformRolePermission("SUPER_ADMIN", perm),
        `SUPER_ADMIN should have ${perm}`
      ).toBe(true);
    }
  });

  it("SUPPORT can view admin areas but not manage them", () => {
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.admin_schools_view)).toBe(true);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.admin_subscriptions_view)).toBe(true);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.admin_users_view)).toBe(true);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.admin_schools_manage)).toBe(false);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.admin_plans_manage)).toBe(false);
  });

  it("SUPPORT can view school-level data but not mutate", () => {
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.finance_view)).toBe(true);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.finance_manage)).toBe(false);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.settings_manage)).toBe(false);
    expect(hasPlatformRolePermission("SUPPORT", PERMISSIONS.students_manage)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Platform matrix matches school matrix for SUPPORT admin views
// ---------------------------------------------------------------------------

describe("PLATFORM_ROLE_PERMISSIONS consistency", () => {
  it("SUPPORT grants are unique", () => {
    const support = PLATFORM_ROLE_PERMISSIONS.SUPPORT.filter(
      (p): p is Permission => p !== "*"
    );
    expect(new Set(support).size).toBe(support.length);
  });

  it("SCHOOL_ADMIN has more permissions than TEACHER", () => {
    expect(ROLE_PERMISSIONS.SCHOOL_ADMIN.length).toBeGreaterThan(
      ROLE_PERMISSIONS.TEACHER.length
    );
  });

  it("STUDENT has fewer permissions than PARENT", () => {
    expect(ROLE_PERMISSIONS.STUDENT.length).toBeLessThan(
      ROLE_PERMISSIONS.PARENT.length
    );
  });
});
