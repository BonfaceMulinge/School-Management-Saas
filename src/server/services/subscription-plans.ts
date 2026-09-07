import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import type { SubscriptionPlan } from "@/generated/prisma/client";

/** Get all subscription plans. */
export async function listPlans(includeInactive = false): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  annualPrice: number;
  isActive: boolean;
  studentLimit: number | null;
  staffLimit: number | null;
  features: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  _count: { subscriptions: number };
}>> {
  return db.subscriptionPlan.findMany({
    where: includeInactive ? {} : { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      annualPrice: true,
      isActive: true,
      studentLimit: true,
      staffLimit: true,
      features: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      updatedById: true,
      _count: { select: { subscriptions: true } },
    },
    orderBy: { annualPrice: "asc" },
  });
}

/** Get a single plan by ID. */
export async function getPlanById(id: string): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  annualPrice: number;
  isActive: boolean;
  studentLimit: number | null;
  staffLimit: number | null;
  features: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  _count: { subscriptions: number };
} | null> {
  return db.subscriptionPlan.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      annualPrice: true,
      isActive: true,
      studentLimit: true,
      staffLimit: true,
      features: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      updatedById: true,
      _count: { select: { subscriptions: true } },
    },
  });
}

/** Get a single plan by slug. */
export async function getPlanBySlug(slug: string): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  annualPrice: number;
  isActive: boolean;
  studentLimit: number | null;
  staffLimit: number | null;
  features: Prisma.JsonValue | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
  updatedById: string;
  _count: { subscriptions: number };
} | null> {
  return db.subscriptionPlan.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      annualPrice: true,
      isActive: true,
      studentLimit: true,
      staffLimit: true,
      features: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      updatedById: true,
      _count: { select: { subscriptions: true } },
    },
  });
}

/** Create a new subscription plan. */
export async function createPlan(data: {
  name: string;
  slug: string;
description?: string;
  annualPrice: number;
  isActive?: boolean;
  studentLimit?: number | null;
  staffLimit?: number | null;
  features?: Prisma.InputJsonValue | null;
  notes?: string;
  createdById: string;
}): Promise<SubscriptionPlan> {
  const features = data.features ?? Prisma.DbNull;
  return db.subscriptionPlan.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description,
      annualPrice: data.annualPrice,
      isActive: data.isActive ?? true,
      studentLimit: data.studentLimit,
      staffLimit: data.staffLimit,
      features,
      notes: data.notes,
      createdById: data.createdById,
      updatedById: data.createdById,
    },
  });
}

/** Update a subscription plan. */
export async function updatePlan(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    description: string | null;
    annualPrice: number;
    isActive: boolean;
    studentLimit: number | null;
    staffLimit: number | null;
    features: Prisma.InputJsonValue | null;
    notes: string | null;
  }> & { updatedById: string }
): Promise<SubscriptionPlan> {
  const { updatedById, features, ...rest } = data;
  const featuresValue =
    features === undefined ? undefined : features === null ? Prisma.DbNull : features;
  return db.subscriptionPlan.update({
    where: { id },
    data: {
      ...rest,
      features: featuresValue,
      updatedById,
    },
  });
}

/** Delete a subscription plan (only if no active subscriptions). */
export async function deletePlan(id: string): Promise<void> {
  const plan = await db.subscriptionPlan.findUnique({
    where: { id },
    include: { subscriptions: { where: { status: { in: ["ACTIVE", "TRIAL", "GRACE_PERIOD"] } } } },
  });
  if (plan && plan.subscriptions.length > 0) {
    throw new Error("Cannot delete plan with active subscriptions");
  }
  await db.subscriptionPlan.delete({ where: { id } });
}

/** Check if a plan slug is available. */
export async function isPlanSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  const existing = await db.subscriptionPlan.findFirst({
    where: { slug, NOT: excludeId ? { id: excludeId } : undefined },
    select: { id: true },
  });
  return !existing;
}