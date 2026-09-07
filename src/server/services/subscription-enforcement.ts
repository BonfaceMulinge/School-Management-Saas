import { getSchoolBySlug } from "@/server/services/schools";
import { getSubscriptionBySchoolId, getSubscriptionWithUsage } from "@/server/services/school-subscriptions";
import type { Prisma, SubscriptionStatus } from "@/generated/prisma/client";

export type UsageResource = "student" | "staff";

/**
 * Thrown when a usage limit check fails inside a write. Callers translate it
 * into a user-facing error (e.g. `fail(e.message)`); it intentionally does
 * not leak internal details.
 */
export class UsageLimitError extends Error {
  readonly resource: UsageResource;
  readonly current: number;
  readonly limit: number | null;

  constructor(resource: UsageResource, current: number, limit: number | null, message: string) {
    super(message);
    this.name = "UsageLimitError";
    this.resource = resource;
    this.current = current;
    this.limit = limit;
  }
}

/**
 * Result of a subscription access check.
 */
export type SubscriptionCheckResult = {
  allowed: boolean;
  subscription?: {
    status: SubscriptionStatus;
    planName: string;
    planSlug: string;
    studentLimit: number | null;
    staffLimit: number | null;
    endDate: Date | null;
    gracePeriodEnd: Date | null;
  } | null;
  reason?: string;
};

/**
 * Check if a school has an active subscription that grants access.
 * Returns the subscription details if allowed, or reason if not.
 */
export async function checkSchoolSubscriptionAccess(schoolSlug: string): Promise<SubscriptionCheckResult> {
  const school = await getSchoolBySlug(schoolSlug);
  if (!school) return { allowed: false, reason: "School not found" };

  const sub = await getSubscriptionBySchoolId(school.id);
  if (!sub) return { allowed: false, reason: "No subscription found for this school" };

  const now = new Date();
  const isInGrace = sub.status === "GRACE_PERIOD" && sub.gracePeriodEnd && sub.gracePeriodEnd > now;
  const isActive = sub.status === "ACTIVE" || sub.status === "TRIAL" || isInGrace;

  if (!isActive) {
    let reason = "Subscription is not active";
    if (sub.status === "EXPIRED") reason = "Subscription has expired";
    else if (sub.status === "SUSPENDED") reason = "Subscription is suspended";
    else if (sub.status === "CANCELLED") reason = "Subscription is cancelled";
    else if (sub.status === "GRACE_PERIOD") reason = "Subscription grace period has ended";
    return { allowed: false, subscription: formatSubscription(sub), reason };
  }

  // Check expiry date
  if (sub.endDate && sub.endDate < now && sub.status !== "GRACE_PERIOD") {
    return {
      allowed: false,
      subscription: formatSubscription(sub),
      reason: "Subscription period has ended",
    };
  }

  return { allowed: true, subscription: formatSubscription(sub) };
}

function formatSubscription(sub: {
  status: SubscriptionStatus;
  plan: { name: string; slug: string; studentLimit: number | null; staffLimit: number | null };
  endDate: Date | null;
  gracePeriodEnd: Date | null;
}) {
  return {
    status: sub.status,
    planName: sub.plan.name,
    planSlug: sub.plan.slug,
    studentLimit: sub.plan.studentLimit,
    staffLimit: sub.plan.staffLimit,
    endDate: sub.endDate,
    gracePeriodEnd: sub.gracePeriodEnd,
  };
}

/**
 * Enforce subscription access - throws if not allowed.
 * Use in server actions, route handlers, and data access layer.
 */
export async function enforceSubscriptionAccess(schoolSlug: string): Promise<void> {
  const result = await checkSchoolSubscriptionAccess(schoolSlug);
  if (!result.allowed) {
    throw new Error(result.reason ?? "Subscription access required");
  }
}

/**
 * Check usage limits for a school.
 * Returns allowed=true if within limits, or reason if limit exceeded.
 */
export async function checkUsageLimits(schoolSlug: string, type: "student" | "staff"): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  reason?: string;
}> {
  const school = await getSchoolBySlug(schoolSlug);
  if (!school) return { allowed: false, current: 0, limit: null, reason: "School not found" };

  const usage = await getSubscriptionWithUsage(school.id);
  if (!usage) return { allowed: false, current: 0, limit: null, reason: "No subscription found" };

  if (type === "student") {
    const limit = usage.subscription?.plan.studentLimit ?? null;
    if (limit !== null && usage.studentCount >= limit) {
      return { allowed: false, current: usage.studentCount, limit, reason: `Student limit (${limit}) reached` };
    }
    return { allowed: true, current: usage.studentCount, limit };
  }

  if (type === "staff") {
    const limit = usage.subscription?.plan.staffLimit ?? null;
    if (limit !== null && usage.staffCount >= limit) {
      return { allowed: false, current: usage.staffCount, limit, reason: `Staff limit (${limit}) reached` };
    }
    return { allowed: true, current: usage.staffCount, limit };
  }

  return { allowed: true, current: 0, limit: null };
}

/**
 * Enforce usage limit - throws if limit exceeded.
 */
export async function enforceUsageLimit(schoolSlug: string, type: "student" | "staff"): Promise<void> {
  const result = await checkUsageLimits(schoolSlug, type);
  if (!result.allowed) {
    throw new Error(result.reason ?? `${type} limit exceeded`);
  }
}

/**
 * Transactional usage-limit guard for writes. Runs inside the caller's
 * transaction (the same one that performs the create/update) and re-reads the
 * current count and the active subscription there, so two concurrent requests
 * cannot easily both slip past the plan limit. Callers should run the write
 * at `Prisma.TransactionIsolationLevel.Serializable`.
 *
 * Throws `UsageLimitError` when the school has no subscription, its
 * subscription is not in an active state, or the plan limit for the resource
 * has been reached. Returns `{ current, limit }` when the write may proceed.
 */
export async function assertUsageCapacityTx(
  tx: Prisma.TransactionClient,
  schoolId: string,
  resource: UsageResource
): Promise<{ current: number; limit: number | null }> {
  const sub = await tx.schoolSubscription.findUnique({
    where: { schoolId },
    select: {
      id: true,
      status: true,
      endDate: true,
      gracePeriodEnd: true,
      plan: { select: { studentLimit: true, staffLimit: true } },
    },
  });

  if (!sub) {
    throw new UsageLimitError(resource, 0, null, "No active subscription found for this school.");
  }

  const now = new Date();
  const isInGrace =
    sub.status === "GRACE_PERIOD" &&
    sub.gracePeriodEnd !== null &&
    sub.gracePeriodEnd > now;
  const isActive = sub.status === "ACTIVE" || sub.status === "TRIAL" || isInGrace;

  if (!isActive || (sub.endDate !== null && sub.endDate < now && sub.status !== "GRACE_PERIOD")) {
    throw new UsageLimitError(resource, 0, null, "The school subscription is not active.");
  }

  const limit = resource === "student" ? sub.plan.studentLimit : sub.plan.staffLimit;
  if (limit === null) return { current: 0, limit: null };

  const current =
    resource === "student"
      ? await tx.student.count({ where: { schoolId, archived: false, status: "ACTIVE" } })
      : await tx.staff.count({ where: { schoolId, archived: false, status: "ACTIVE" } });

  if (current >= limit) {
    const label = resource === "student" ? "Student" : "Staff";
    throw new UsageLimitError(resource, current, limit, `${label} limit (${limit}) reached.`);
  }

  return { current, limit };
}