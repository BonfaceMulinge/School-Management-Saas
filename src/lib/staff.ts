import type { StaffRole, StaffStatus } from "@/generated/prisma/client";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  TEACHER: "Teacher",
  SCHOOL_ADMIN: "School Administrator",
  ACCOUNTANT: "Accountant",
  SUPPORT_STAFF: "Support Staff",
  OTHER: "Other",
};

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};