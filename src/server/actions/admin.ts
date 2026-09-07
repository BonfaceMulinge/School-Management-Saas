"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertSuperAdmin } from "@/server/platform-auth";
import {
  createSchool,
  updateSchool,
  setSchoolStatus,
  archiveSchool,
  getSchoolById,
  listSchools,
} from "@/server/services/admin-schools";
import {
  createPlan,
  updatePlan,
  deletePlan,
  listPlans,
} from "@/server/services/subscription-plans";
import {
  createSubscription,
  setSubscriptionStatus,
  cancelSubscription,
} from "@/server/services/school-subscriptions";
import { createAuditLog } from "@/server/services/audit-log";
import { provisionSchoolAdminWithAudit } from "@/server/services/school-admin-provisioning";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { Prisma, type SchoolStatus, type SubscriptionStatus } from "@/generated/prisma/client";

const SCHOOL_STATUSES: SchoolStatus[] = ["ACTIVE", "SUSPENDED", "ARCHIVED"];
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "TRIAL",
  "ACTIVE",
  "GRACE_PERIOD",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
];

function adminPaths(slug?: string) {
  const paths = ["/admin", "/admin/schools", "/admin/subscriptions", "/admin/plans"];
  if (slug) paths.push(`/admin/schools/${slug}`);
  return paths;
}

// ---------------------------------------------------------------------------
// Dropdown data for admin client dialogs.
// ---------------------------------------------------------------------------

export async function listSchoolsForAdmin(): Promise<Array<{ id: string; name: string; slug: string }>> {
  await assertSuperAdmin();
  const schools = await listSchools();
  return schools.map((s) => ({ id: s.id, name: s.name, slug: s.slug }));
}

export async function listPlansForAdmin(): Promise<Array<{ id: string; name: string; slug: string }>> {
  await assertSuperAdmin();
  const plans = await listPlans(true);
  return plans.map((p) => ({ id: p.id, name: p.name, slug: p.slug }));
}

// ---------------------------------------------------------------------------
// Schools.
// ---------------------------------------------------------------------------

const schoolShape = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."),
  email: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  motto: z.string().trim().max(240).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  currency: z.string().trim().min(1).max(10).default("USD"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  primaryColor: z.string().trim().max(16).optional().or(z.literal("")),
  adminEmail: z.email("Enter a valid administrator email.").optional().or(z.literal("")),
  adminName: z.string().trim().max(120).optional().or(z.literal("")),
  adminPassword: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200)
    .optional()
    .or(z.literal("")),
});

export async function createSchoolAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const access = await assertSuperAdmin();
  const parsed = schoolShape.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const slugExists = await db.school.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (slugExists) {
    return fail("A school with this slug already exists.", { slug: ["Slug is already taken."] });
  }

  const school = await createSchool({
    name: data.name,
    slug: data.slug,
    email: data.email || undefined,
    phone: data.phone || undefined,
    address: data.address || undefined,
    currency: data.currency,
    timezone: data.timezone,
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "SCHOOL_CREATE",
    entity: "School",
    entityId: school.id,
    metadata: { name: school.name, slug: school.slug },
  });

  if (data.adminEmail) {
    if (!data.adminPassword) {
      return fail("A temporary password is required when provisioning an administrator.", {
        adminPassword: ["Required when an administrator email is set."],
      });
    }
    const provisioned = await provisionSchoolAdminWithAudit({
      actorId: access.user.id,
      schoolId: school.id,
      email: data.adminEmail,
      name: data.adminName || undefined,
      password: data.adminPassword,
    });
    if (!provisioned.ok) return fail(provisioned.error);
  }

  for (const p of adminPaths()) revalidatePath(p);
  return ok({ id: school.id });
}

export async function updateSchoolAction(id: string, input: unknown): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const existing = await getSchoolById(id);
  if (!existing) return fail("School not found.");

  const parsed = schoolShape.partial().safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const slugExists = await db.school.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (slugExists) {
      return fail("A school with this slug already exists.", { slug: ["Slug is already taken."] });
    }
  }

  await updateSchool(id, {
    name: data.name ?? undefined,
    slug: data.slug ?? undefined,
    email: data.email === undefined ? undefined : data.email || null,
    phone: data.phone === undefined ? undefined : data.phone || null,
    address: data.address === undefined ? undefined : data.address || null,
    motto: data.motto === undefined ? undefined : data.motto || null,
    website: data.website === undefined ? undefined : data.website || null,
    currency: data.currency ?? undefined,
    timezone: data.timezone ?? undefined,
    primaryColor: data.primaryColor === undefined ? undefined : data.primaryColor || null,
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "SCHOOL_UPDATE",
    entity: "School",
    entityId: id,
    schoolId: id,
    metadata: { name: existing.name, slug: existing.slug },
  });

  for (const p of adminPaths(id)) revalidatePath(p);
  return ok();
}

export async function setSchoolStatusAction(id: string, status: string): Promise<ActionResult> {
  const access = await assertSuperAdmin();
  if (!SCHOOL_STATUSES.includes(status as SchoolStatus)) return fail("Invalid status.");

  const existing = await getSchoolById(id);
  if (!existing) return fail("School not found.");

  await setSchoolStatus(id, status as SchoolStatus);

  await createAuditLog({
    actorId: access.user.id,
    action: "SCHOOL_STATUS_CHANGE",
    entity: "School",
    entityId: id,
    schoolId: id,
    metadata: { from: existing.status, to: status },
  });

  for (const p of adminPaths(id)) revalidatePath(p);
  return ok();
}

export async function archiveSchoolAction(id: string): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const existing = await getSchoolById(id);
  if (!existing) return fail("School not found.");

  await archiveSchool(id);

  await createAuditLog({
    actorId: access.user.id,
    action: "SCHOOL_STATUS_CHANGE",
    entity: "School",
    entityId: id,
    schoolId: id,
    metadata: { from: existing.status, to: "ARCHIVED" },
  });

  for (const p of adminPaths(id)) revalidatePath(p);
  return ok();
}

// ---------------------------------------------------------------------------
// School administrator provisioning.
// ---------------------------------------------------------------------------

/**
 * Provision the first SCHOOL_ADMIN for a school (or link an existing account
 * by email). SUPER_ADMIN only. Never assigns platform roles and never stores
 * or logs the plaintext password — the helper only sets a password hash when
 * the account has none.
 */
export async function provisionSchoolAdminAction(input: {
  schoolId: string;
  email: string;
  name?: string;
  password: string;
}): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const parsed = z
    .object({
      schoolId: z.string().min(1, "School is required."),
      email: z.email("Enter a valid email address.").trim().toLowerCase(),
      name: z.string().trim().max(120).optional().or(z.literal("")),
      password: z.string().min(8, "Password must be at least 8 characters.").max(200),
    })
    .safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const provisioned = await provisionSchoolAdminWithAudit({
    actorId: access.user.id,
    schoolId: data.schoolId,
    email: data.email,
    name: data.name || undefined,
    password: data.password,
  });
  if (!provisioned.ok) return fail(provisioned.error);

  for (const p of adminPaths(data.schoolId)) revalidatePath(p);
  revalidatePath("/admin/users");
  return ok();
}

// ---------------------------------------------------------------------------
// Subscription plans.
// ---------------------------------------------------------------------------

const planShape = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only."),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  annualPrice: z.number().int().min(0, "Price must be non-negative."),
  isActive: z.boolean().optional(),
  studentLimit: z.number().int().positive().optional().nullable(),
  staffLimit: z.number().int().positive().optional().nullable(),
  features: z.unknown().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function createPlanAction(input: unknown): Promise<ActionResult> {
  const access = await assertSuperAdmin();
  const parsed = planShape.safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const slugExists = await db.subscriptionPlan.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (slugExists) {
    return fail("A plan with this slug already exists.", { slug: ["Slug is already taken."] });
  }

  const plan = await createPlan({
    name: data.name,
    slug: data.slug,
    description: data.description || undefined,
    annualPrice: data.annualPrice,
    isActive: data.isActive ?? true,
    studentLimit: data.studentLimit ?? null,
    staffLimit: data.staffLimit ?? null,
    features: data.features !== undefined ? (data.features as Prisma.InputJsonValue) : null,
    notes: data.notes || undefined,
    createdById: access.user.id,
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "PLAN_CREATE",
    entity: "SubscriptionPlan",
    entityId: plan.id,
    metadata: { name: plan.name, slug: plan.slug, annualPrice: plan.annualPrice },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

export async function updatePlanAction(id: string, input: unknown): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const existing = await db.subscriptionPlan.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) return fail("Plan not found.");

  const parsed = planShape.partial().safeParse(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const slugExists = await db.subscriptionPlan.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (slugExists) {
      return fail("A plan with this slug already exists.", { slug: ["Slug is already taken."] });
    }
  }

  await updatePlan(id, {
    name: data.name ?? undefined,
    slug: data.slug ?? undefined,
    description: data.description === undefined ? undefined : data.description || null,
    annualPrice: data.annualPrice ?? undefined,
    isActive: data.isActive ?? undefined,
    studentLimit: data.studentLimit ?? undefined,
    staffLimit: data.staffLimit ?? undefined,
    features:
      data.features === undefined ? undefined : (data.features as Prisma.InputJsonValue) ?? null,
    notes: data.notes === undefined ? undefined : data.notes || null,
    updatedById: access.user.id,
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "PLAN_UPDATE",
    entity: "SubscriptionPlan",
    entityId: id,
    metadata: { name: data.name ?? existing.slug },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

export async function deletePlanAction(id: string): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const existing = await db.subscriptionPlan.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) return fail("Plan not found.");

  await deletePlan(id);

  await createAuditLog({
    actorId: access.user.id,
    action: "OTHER",
    entity: "SubscriptionPlan",
    entityId: id,
    metadata: { operation: "delete", name: existing.name },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

// ---------------------------------------------------------------------------
// School subscriptions.
// ---------------------------------------------------------------------------

export async function createSubscriptionAction(input: {
  schoolId: string;
  planId: string;
  status?: string;
  startDate: string;
  endDate?: string | null;
  gracePeriodEnd?: string | null;
  paymentRef?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  if (!input.schoolId || !input.planId || !input.startDate) {
    return fail("School, plan, and start date are required.");
  }
  if (input.status && !SUBSCRIPTION_STATUSES.includes(input.status as SubscriptionStatus)) {
    return fail("Invalid subscription status.");
  }

  const school = await db.school.findUnique({
    where: { id: input.schoolId },
    select: { id: true },
  });
  if (!school) return fail("School not found.");

  const plan = await db.subscriptionPlan.findUnique({
    where: { id: input.planId },
    select: { id: true, isActive: true },
  });
  if (!plan) return fail("Plan not found.");
  if (!plan.isActive) return fail("That plan is inactive.");

  const existingSub = await db.schoolSubscription.findUnique({
    where: { schoolId: input.schoolId },
    select: { id: true },
  });
  if (existingSub) return fail("This school already has a subscription.");

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) return fail("Invalid start date.");

  const endDate = input.endDate ? new Date(input.endDate) : undefined;
  const gracePeriodEnd = input.gracePeriodEnd ? new Date(input.gracePeriodEnd) : undefined;
  if (endDate && Number.isNaN(endDate.getTime())) return fail("Invalid end date.");
  if (gracePeriodEnd && Number.isNaN(gracePeriodEnd.getTime())) return fail("Invalid grace period end date.");

  await createSubscription({
    schoolId: input.schoolId,
    planId: input.planId,
    status: (input.status ?? "TRIAL") as SubscriptionStatus,
    startDate,
    endDate,
    gracePeriodEnd,
    paymentRef: input.paymentRef || undefined,
    notes: input.notes || undefined,
    createdById: access.user.id,
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "SUBSCRIPTION_CREATE",
    entity: "SchoolSubscription",
    entityId: input.schoolId,
    schoolId: input.schoolId,
    metadata: { planId: input.planId, status: input.status ?? "TRIAL", startDate },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

export async function setSubscriptionStatusAction(
  id: string,
  status: string
): Promise<ActionResult> {
  const access = await assertSuperAdmin();
  if (!SUBSCRIPTION_STATUSES.includes(status as SubscriptionStatus)) return fail("Invalid status.");

  const existing = await db.schoolSubscription.findUnique({
    where: { id },
    select: { id: true, schoolId: true, status: true },
  });
  if (!existing) return fail("Subscription not found.");

  await setSubscriptionStatus(id, status as SubscriptionStatus, access.user.id);

  await createAuditLog({
    actorId: access.user.id,
    action: "SUBSCRIPTION_STATUS_CHANGE",
    entity: "SchoolSubscription",
    entityId: id,
    schoolId: existing.schoolId,
    metadata: { from: existing.status, to: status },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

export async function cancelSubscriptionAction(
  id: string,
  opts?: { immediate?: boolean; gracePeriodDays?: number }
): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const existing = await db.schoolSubscription.findUnique({
    where: { id },
    select: { id: true, schoolId: true },
  });
  if (!existing) return fail("Subscription not found.");

  await cancelSubscription(id, access.user.id, opts);

  await createAuditLog({
    actorId: access.user.id,
    action: "SUBSCRIPTION_STATUS_CHANGE",
    entity: "SchoolSubscription",
    entityId: id,
    schoolId: existing.schoolId,
    metadata: { to: "CANCELLED", ...(opts ?? {}) },
  });

  for (const p of adminPaths()) revalidatePath(p);
  return ok();
}

// ---------------------------------------------------------------------------
// Platform roles.
// ---------------------------------------------------------------------------

const PLATFORM_ROLES = ["SUPER_ADMIN", "SUPPORT"] as const;
type EditablePlatformRole = (typeof PLATFORM_ROLES)[number] | null;

/**
 * Assign, change, or remove a user's platform role. SUPER_ADMIN only.
 * Platform roles are kept fully separate from school-scoped Membership roles,
 * and the final SUPER_ADMIN account can never be demoted (prevents lockout).
 */
export async function setPlatformRoleAction(
  userId: string,
  role: EditablePlatformRole
): Promise<ActionResult> {
  const access = await assertSuperAdmin();
  if (!userId) return fail("User is required.");
  if (role !== null && !PLATFORM_ROLES.includes(role)) {
    return fail("Invalid platform role.");
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true },
  });
  if (!target) return fail("User not found.");

  if (target.platformRole === role) {
    return fail("This user already has that platform role.");
  }

  if (target.platformRole === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const superAdminCount = await db.user.count({
      where: { platformRole: "SUPER_ADMIN" },
    });
    if (superAdminCount <= 1) {
      return fail("Cannot remove the last Super Admin.");
    }
  }

  await db.user.update({
    where: { id: userId },
    data: { platformRole: role },
  });

  await createAuditLog({
    actorId: access.user.id,
    action: "USER_PLATFORM_ROLE_CHANGE",
    entity: "User",
    entityId: userId,
    metadata: { email: target.email, from: target.platformRole, to: role },
  });

  revalidatePath("/admin/users");
  return ok();
}