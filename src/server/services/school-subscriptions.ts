import { db } from "@/server/db";
import type { Prisma, SchoolSubscription, SubscriptionStatus, SubscriptionEventType } from "@/generated/prisma/client";

/** Get a school's subscription by school ID. */
export async function getSubscriptionBySchoolId(schoolId: string): Promise<{
  id: string;
  schoolId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date | null;
  gracePeriodEnd: Date | null;
  cancelledAt: Date | null;
  paymentRef: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  plan: { id: string; name: string; slug: string; annualPrice: number; studentLimit: number | null; staffLimit: number | null };
  school: { id: string; name: string; slug: string };
} | null> {
  return db.schoolSubscription.findUnique({
    where: { schoolId },
    include: {
      plan: { select: { id: true, name: true, slug: true, annualPrice: true, studentLimit: true, staffLimit: true } },
      school: { select: { id: true, name: true, slug: true } },
    },
  });
}

/** Get a subscription by ID. */
export async function getSubscriptionById(id: string): Promise<{
  id: string;
  schoolId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date | null;
  gracePeriodEnd: Date | null;
  cancelledAt: Date | null;
  paymentRef: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  plan: { id: string; name: string; slug: string; annualPrice: number; studentLimit: number | null; staffLimit: number | null };
  school: { id: string; name: string; slug: string };
} | null> {
  return db.schoolSubscription.findUnique({
    where: { id },
    include: {
      plan: { select: { id: true, name: true, slug: true, annualPrice: true, studentLimit: true, staffLimit: true } },
      school: { select: { id: true, name: true, slug: true } },
    },
  });
}

/** List all subscriptions with optional status filter. */
export async function listSubscriptions(
  status?: SubscriptionStatus
): Promise<Array<{
  id: string;
  schoolId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date | null;
  gracePeriodEnd: Date | null;
  cancelledAt: Date | null;
  paymentRef: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  plan: { id: string; name: string; slug: string; annualPrice: number; studentLimit: number | null; staffLimit: number | null };
  school: { id: string; name: string; slug: string };
}>> {
  return db.schoolSubscription.findMany({
    where: status ? { status } : {},
    include: {
      plan: { select: { id: true, name: true, slug: true, annualPrice: true, studentLimit: true, staffLimit: true } },
      school: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Append an immutable lifecycle event inside the caller's transaction. */
async function recordEventTx(
  tx: Prisma.TransactionClient,
  event: {
    schoolId: string;
    subscriptionId: string;
    planId: string;
    type: SubscriptionEventType;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus;
    startDate?: Date | null;
    endDate?: Date | null;
    gracePeriodEnd?: Date | null;
    reason?: string | null;
    reference?: string | null;
    actorId: string;
  }
) {
  await tx.subscriptionEvent.create({
    data: {
      schoolId: event.schoolId,
      subscriptionId: event.subscriptionId,
      planId: event.planId,
      type: event.type,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      startDate: event.startDate ?? null,
      endDate: event.endDate ?? null,
      gracePeriodEnd: event.gracePeriodEnd ?? null,
      reason: event.reason ?? null,
      reference: event.reference ?? null,
      actorId: event.actorId,
    },
  });
}

/** Create a new subscription for a school. */
export async function createSubscription(data: {
  schoolId: string;
  planId: string;
  status?: SubscriptionStatus;
  startDate: Date;
  endDate?: Date | null;
  gracePeriodEnd?: Date | null;
  paymentRef?: string;
  notes?: string;
  createdById: string;
}): Promise<SchoolSubscription> {
  const status = data.status ?? "TRIAL";
  return db.$transaction(async (tx) => {
    const sub = await tx.schoolSubscription.create({
      data: {
        schoolId: data.schoolId,
        planId: data.planId,
        status,
        startDate: data.startDate,
        endDate: data.endDate,
        gracePeriodEnd: data.gracePeriodEnd,
        paymentRef: data.paymentRef,
        notes: data.notes,
        createdById: data.createdById,
        updatedById: data.createdById,
      },
    });

    await recordEventTx(tx, {
      schoolId: data.schoolId,
      subscriptionId: sub.id,
      planId: data.planId,
      type: "CREATED",
      fromStatus: null,
      toStatus: status,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      gracePeriodEnd: data.gracePeriodEnd ?? null,
      reference: data.paymentRef ?? null,
      actorId: data.createdById,
    });

    return sub;
  });
}

/** Update a subscription. Plan changes append a PLAN_CHANGED event and date
 * extensions (with the plan unchanged) a RENEWED event, preserving history. */
export async function updateSubscription(
  id: string,
  data: Partial<{
    planId: string;
    status: SubscriptionStatus;
    startDate: Date;
    endDate: Date | null;
    gracePeriodEnd: Date | null;
    cancelledAt: Date | null;
    paymentRef: string | null;
    notes: string | null;
  }> & { updatedById: string }
): Promise<SchoolSubscription> {
  const { updatedById, ...rest } = data;
  return db.$transaction(async (tx) => {
    const current = await tx.schoolSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        planId: true,
        status: true,
        startDate: true,
        endDate: true,
        gracePeriodEnd: true,
      },
    });
    if (!current) throw new Error("Subscription not found.");

    const sub = await tx.schoolSubscription.update({
      where: { id },
      data: {
        ...rest,
        updatedById,
      },
    });

    const planChanged = rest.planId !== undefined && rest.planId !== current.planId;
    const renewed =
      !planChanged &&
      rest.endDate !== undefined &&
      sub.endDate !== null &&
      current.endDate !== null &&
      sub.endDate.getTime() > current.endDate.getTime();

    if (planChanged || renewed) {
      await recordEventTx(tx, {
        schoolId: current.schoolId,
        subscriptionId: id,
        planId: sub.planId,
        type: planChanged ? "PLAN_CHANGED" : "RENEWED",
        fromStatus: current.status,
        toStatus: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        gracePeriodEnd: sub.gracePeriodEnd,
        reason: planChanged ? "Plan changed" : "Subscription renewed",
        actorId: updatedById,
      });
    }

    return sub;
  });
}

/** Change subscription status. Status changes append a STATUS_CHANGED event. */
export async function setSubscriptionStatus(
  id: string,
  status: SubscriptionStatus,
  updatedById: string,
  opts?: { gracePeriodEnd?: Date | null; cancelledAt?: Date | null; reason?: string | null }
): Promise<SchoolSubscription> {
  return db.$transaction(async (tx) => {
    const current = await tx.schoolSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        planId: true,
        status: true,
        startDate: true,
        endDate: true,
        gracePeriodEnd: true,
      },
    });
    if (!current) throw new Error("Subscription not found.");

    const sub = await tx.schoolSubscription.update({
      where: { id },
      data: {
        status,
        gracePeriodEnd: opts?.gracePeriodEnd ?? undefined,
        cancelledAt: opts?.cancelledAt ?? undefined,
        updatedById,
      },
    });

    await recordEventTx(tx, {
      schoolId: current.schoolId,
      subscriptionId: id,
      planId: sub.planId,
      type: "STATUS_CHANGED",
      fromStatus: current.status,
      toStatus: status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      gracePeriodEnd: sub.gracePeriodEnd,
      reason: opts?.reason ?? null,
      actorId: updatedById,
    });

    return sub;
  });
}

/** Cancel a subscription. Cancellations append a CANCELLED event. */
export async function cancelSubscription(
  id: string,
  updatedById: string,
  opts?: { immediate?: boolean; gracePeriodDays?: number; reason?: string | null }
): Promise<SchoolSubscription> {
  const now = new Date();
  const gracePeriodEnd = opts?.immediate
    ? now
    : opts?.gracePeriodDays
      ? new Date(now.getTime() + opts.gracePeriodDays * 24 * 60 * 60 * 1000)
      : undefined;

  return db.$transaction(async (tx) => {
    const current = await tx.schoolSubscription.findUnique({
      where: { id },
      select: {
        id: true,
        schoolId: true,
        planId: true,
        status: true,
        startDate: true,
        endDate: true,
        gracePeriodEnd: true,
      },
    });
    if (!current) throw new Error("Subscription not found.");

    const sub = await tx.schoolSubscription.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        gracePeriodEnd: gracePeriodEnd ?? undefined,
        updatedById,
      },
    });

    await recordEventTx(tx, {
      schoolId: current.schoolId,
      subscriptionId: id,
      planId: sub.planId,
      type: "CANCELLED",
      fromStatus: current.status,
      toStatus: "CANCELLED",
      startDate: sub.startDate,
      endDate: sub.endDate,
      gracePeriodEnd: sub.gracePeriodEnd,
      reason: opts?.reason ?? null,
      actorId: updatedById,
    });

    return sub;
  });
}

/** Check if a school has an active subscription. */
export async function hasActiveSubscription(schoolId: string): Promise<boolean> {
  const sub = await db.schoolSubscription.findUnique({
    where: { schoolId },
    select: { status: true, endDate: true, gracePeriodEnd: true },
  });
  if (!sub) return false;
  if (sub.status === "ACTIVE" || sub.status === "TRIAL") return true;
  if (sub.status === "GRACE_PERIOD") {
    if (sub.gracePeriodEnd && sub.gracePeriodEnd > new Date()) return true;
  }
  return false;
}

/** Get subscription with usage counts for limit checking. */
export async function getSubscriptionWithUsage(schoolId: string): Promise<{
  subscription: ({
    id: string;
    status: SubscriptionStatus;
    plan: { studentLimit: number | null; staffLimit: number | null };
    endDate: Date | null;
    gracePeriodEnd: Date | null;
  } & { plan: { studentLimit: number | null; staffLimit: number | null } }) | null;
  studentCount: number;
  staffCount: number;
} | null> {
  const sub = await db.schoolSubscription.findUnique({
    where: { schoolId },
    include: { plan: true },
  });
  if (!sub) return null;

  const [studentCount, staffCount] = await Promise.all([
    db.student.count({ where: { schoolId, archived: false, status: "ACTIVE" } }),
    db.staff.count({ where: { schoolId, archived: false, status: "ACTIVE" } }),
  ]);

  return { subscription: sub, studentCount, staffCount };
}

/** List a school's immutable subscription lifecycle history, newest first. */
export async function listSubscriptionEvents(schoolId: string): Promise<
  Array<{
    id: string;
    type: SubscriptionEventType;
    fromStatus: SubscriptionStatus | null;
    toStatus: SubscriptionStatus;
    startDate: Date | null;
    endDate: Date | null;
    gracePeriodEnd: Date | null;
    reason: string | null;
    createdAt: Date;
    actorName: string | null;
    planName: string;
    planSlug: string;
  }>
> {
  const events = await db.subscriptionEvent.findMany({
    where: { schoolId },
    include: {
      actor: { select: { name: true } },
      plan: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return events.map((e) => ({
    id: e.id,
    type: e.type,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    startDate: e.startDate,
    endDate: e.endDate,
    gracePeriodEnd: e.gracePeriodEnd,
    reason: e.reason,
    createdAt: e.createdAt,
    actorName: e.actor.name,
    planName: e.plan.name,
    planSlug: e.plan.slug,
  }));
}