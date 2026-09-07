/**
 * Pure, server/client-safe permission constants and check functions.
 * Single source of truth for all role → permission mappings.
 *
 * Extracted from src/server/authorization.ts and src/server/platform-auth.ts
 * so the logic is testable without a database connection.
 */

// ---------------------------------------------------------------------------
// Permission strings
// ---------------------------------------------------------------------------

export const PERMISSIONS = {
  dashboard_view: "dashboard:view",
  settings_view: "settings:view",
  settings_manage: "settings:manage",
  members_view: "members:view",
  members_manage: "members:manage",
  academic_years_view: "academic-years:view",
  academic_years_manage: "academic-years:manage",
  terms_view: "terms:view",
  terms_manage: "terms:manage",
  classes_view: "classes:view",
  classes_manage: "classes:manage",
  streams_view: "streams:view",
  streams_manage: "streams:manage",
  subjects_view: "subjects:view",
  subjects_manage: "subjects:manage",
  assignments_view: "assignments:view",
  assignments_manage: "assignments:manage",
  enrollments_view: "enrollments:view",
  enrollments_manage: "enrollments:manage",
  students_view: "students:view",
  students_manage: "students:manage",
  parents_view: "parents:view",
  parents_manage: "parents:manage",
  staff_view: "staff:view",
  staff_manage: "staff:manage",
  attendance_view: "attendance:view",
  attendance_manage: "attendance:manage",
  attendance_report: "attendance:report",
  exams_view: "exams:view",
  exams_manage: "exams:manage",
  grading_view: "grading:view",
  grading_manage: "grading:manage",
  results_view: "results:view",
  results_manage: "results:manage",
  finance_view: "finance:view",
  finance_manage: "finance:manage",
  finance_report: "finance:report",
  communication_view: "communication:view",
  communication_send: "communication:send",
  communication_manage: "communication:manage",
  documents_view: "documents:view",
  documents_manage: "documents:manage",
  admin_schools_view: "admin:schools:view",
  admin_schools_manage: "admin:schools:manage",
  admin_subscriptions_view: "admin:subscriptions:view",
  admin_subscriptions_manage: "admin:subscriptions:manage",
  admin_plans_view: "admin:plans:view",
  admin_plans_manage: "admin:plans:manage",
  admin_users_view: "admin:users:view",
  admin_users_manage: "admin:users:manage",
  admin_audit_view: "admin:audit:view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ---------------------------------------------------------------------------
// Role types (mirrors Prisma enums — string literals avoid client-side import)
// ---------------------------------------------------------------------------

export type SchoolRole =
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "STAFF";

export type PlatformRole = "SUPER_ADMIN" | "SUPPORT";

// ---------------------------------------------------------------------------
// School-scoped role → permission matrix
// ---------------------------------------------------------------------------

export const ROLE_PERMISSIONS: Record<SchoolRole, readonly Permission[]> = {
  SCHOOL_ADMIN: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.settings_view,
    PERMISSIONS.settings_manage,
    PERMISSIONS.members_view,
    PERMISSIONS.members_manage,
    PERMISSIONS.academic_years_view,
    PERMISSIONS.academic_years_manage,
    PERMISSIONS.terms_view,
    PERMISSIONS.terms_manage,
    PERMISSIONS.classes_view,
    PERMISSIONS.classes_manage,
    PERMISSIONS.streams_view,
    PERMISSIONS.streams_manage,
    PERMISSIONS.subjects_view,
    PERMISSIONS.subjects_manage,
    PERMISSIONS.assignments_view,
    PERMISSIONS.assignments_manage,
    PERMISSIONS.enrollments_view,
    PERMISSIONS.enrollments_manage,
    PERMISSIONS.students_view,
    PERMISSIONS.students_manage,
    PERMISSIONS.parents_view,
    PERMISSIONS.parents_manage,
    PERMISSIONS.staff_view,
    PERMISSIONS.staff_manage,
    PERMISSIONS.attendance_view,
    PERMISSIONS.attendance_manage,
    PERMISSIONS.attendance_report,
    PERMISSIONS.exams_view,
    PERMISSIONS.exams_manage,
    PERMISSIONS.grading_view,
    PERMISSIONS.grading_manage,
    PERMISSIONS.results_view,
    PERMISSIONS.results_manage,
    PERMISSIONS.finance_view,
    PERMISSIONS.finance_manage,
    PERMISSIONS.finance_report,
    PERMISSIONS.communication_view,
    PERMISSIONS.communication_send,
    PERMISSIONS.communication_manage,
    PERMISSIONS.documents_view,
    PERMISSIONS.documents_manage,
  ],
  TEACHER: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.settings_view,
    PERMISSIONS.academic_years_view,
    PERMISSIONS.terms_view,
    PERMISSIONS.classes_view,
    PERMISSIONS.streams_view,
    PERMISSIONS.subjects_view,
    PERMISSIONS.assignments_view,
    PERMISSIONS.students_view,
    PERMISSIONS.staff_view,
    PERMISSIONS.attendance_view,
    PERMISSIONS.attendance_manage,
    PERMISSIONS.exams_view,
    PERMISSIONS.exams_manage,
    PERMISSIONS.results_view,
    PERMISSIONS.grading_view,
    PERMISSIONS.finance_view,
    PERMISSIONS.communication_view,
    PERMISSIONS.communication_send,
    PERMISSIONS.documents_view,
  ],
  STUDENT: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.students_view,
    PERMISSIONS.attendance_view,
    PERMISSIONS.results_view,
    PERMISSIONS.finance_view,
    PERMISSIONS.communication_view,
  ],
  PARENT: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.students_view,
    PERMISSIONS.attendance_view,
    PERMISSIONS.results_view,
    PERMISSIONS.finance_view,
    PERMISSIONS.communication_view,
    PERMISSIONS.documents_view,
  ],
  STAFF: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.settings_view,
    PERMISSIONS.staff_view,
  ],
};

// ---------------------------------------------------------------------------
// Platform role → permission matrix (school-level)
// ---------------------------------------------------------------------------

export const PLATFORM_ROLE_PERMISSIONS: Record<
  PlatformRole,
  readonly (Permission | "*")[]
> = {
  SUPER_ADMIN: ["*"],
  SUPPORT: [
    PERMISSIONS.dashboard_view,
    PERMISSIONS.settings_view,
    PERMISSIONS.members_view,
    PERMISSIONS.academic_years_view,
    PERMISSIONS.terms_view,
    PERMISSIONS.classes_view,
    PERMISSIONS.streams_view,
    PERMISSIONS.subjects_view,
    PERMISSIONS.assignments_view,
    PERMISSIONS.enrollments_view,
    PERMISSIONS.students_view,
    PERMISSIONS.parents_view,
    PERMISSIONS.staff_view,
    PERMISSIONS.attendance_view,
    PERMISSIONS.attendance_report,
    PERMISSIONS.exams_view,
    PERMISSIONS.grading_view,
    PERMISSIONS.results_view,
    PERMISSIONS.finance_view,
    PERMISSIONS.finance_report,
    PERMISSIONS.communication_view,
    PERMISSIONS.documents_view,
    PERMISSIONS.admin_schools_view,
    PERMISSIONS.admin_subscriptions_view,
    PERMISSIONS.admin_plans_view,
    PERMISSIONS.admin_users_view,
    PERMISSIONS.admin_audit_view,
  ],
};

// ---------------------------------------------------------------------------
// Pure check functions
// ---------------------------------------------------------------------------

/**
 * Check whether a school role grants a specific permission.
 */
export function hasSchoolRolePermission(
  role: SchoolRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check whether a platform role grants a specific permission.
 * SUPER_ADMIN ("*") grants every permission.
 */
export function hasPlatformRolePermission(
  platformRole: PlatformRole,
  permission: Permission
): boolean {
  const grants = PLATFORM_ROLE_PERMISSIONS[platformRole];
  return grants.includes("*") || grants.includes(permission);
}
