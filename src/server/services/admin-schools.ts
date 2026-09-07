import { db } from "@/server/db";
import type { SchoolStatus, School, SubscriptionStatus } from "@/generated/prisma/client";

/** Get all schools with optional status filter (platform staff only). */
export async function listSchools(
  status?: SchoolStatus
): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  motto: string | null;
  website: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  primaryColor: string | null;
  status: SchoolStatus;
  createdAt: Date;
  updatedAt: Date;
  _count: { memberships: number; students: number; subscriptions: number };
}>> {
  return db.school.findMany({
    where: status ? { status } : {},
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      address: true,
      motto: true,
      website: true,
      logoUrl: true,
      currency: true,
      timezone: true,
      primaryColor: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          memberships: true,
          students: true,
          subscriptions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Get a single school by ID with full details (platform staff only). */
export async function getSchoolById(id: string): Promise<{
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  motto: string | null;
  website: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  primaryColor: string | null;
  status: SchoolStatus;
  createdAt: Date;
  updatedAt: Date;
  memberships: Array<{
    id: string;
    userId: string;
    role: string;
    user: { id: string; name: string | null; email: string };
  }>;
  subscriptions: Array<{
    id: string;
    status: SubscriptionStatus;
    startDate: Date;
    endDate: Date | null;
    gracePeriodEnd: Date | null;
    cancelledAt: Date | null;
    paymentRef: string | null;
    notes: string | null;
    plan: { id: string; name: string; studentLimit: number | null; staffLimit: number | null };
  }>;
  _count: { memberships: number; students: number; subscriptions: number };
} | null> {
  return db.school.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      subscriptions: {
        include: { plan: { select: { id: true, name: true, studentLimit: true, staffLimit: true } } },
      },
      _count: {
        select: { memberships: true, students: true, subscriptions: true },
      },
    },
  });
}

/** Get school counts for dashboard statistics. */
export async function getSchoolCounts(): Promise<{
  total: number;
  active: number;
  suspended: number;
  archived: number;
}> {
  const [total, active, suspended, archived] = await Promise.all([
    db.school.count(),
    db.school.count({ where: { status: "ACTIVE" } }),
    db.school.count({ where: { status: "SUSPENDED" } }),
    db.school.count({ where: { status: "ARCHIVED" } }),
  ]);
  return { total, active, suspended, archived };
}

/** Create a new school (platform staff only). Also seeds the one-to-one
 * configuration and onboarding rows so the tenant starts with defaults and a
 * fresh onboarding flow. */
export async function createSchool(data: {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  currency?: string;
  timezone?: string;
}): Promise<School> {
  return db.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name: data.name,
        slug: data.slug,
        email: data.email,
        phone: data.phone,
        address: data.address,
        currency: data.currency ?? "USD",
        timezone: data.timezone ?? "UTC",
        status: "ACTIVE",
      },
    });

    await tx.schoolSettings.create({ data: { schoolId: school.id } });
    await tx.schoolOnboarding.create({ data: { schoolId: school.id } });

    return school;
  });
}

/** Update school details (platform staff only). */
export async function updateSchool(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    motto: string | null;
    website: string | null;
    logoUrl: string | null;
    currency: string;
    timezone: string;
    primaryColor: string | null;
  }>
): Promise<School> {
  return db.school.update({
    where: { id },
    data,
  });
}

/** Change school status (platform staff only). */
export async function setSchoolStatus(
  id: string,
  status: SchoolStatus
): Promise<School> {
  return db.school.update({
    where: { id },
    data: { status },
  });
}

/** Archive a school (platform staff only). */
export async function archiveSchool(id: string): Promise<School> {
  return db.school.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

/** Get recently created schools. */
export async function getRecentSchools(limit = 5) {
  return db.school.findMany({
    take: limit,
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      phone: true,
      address: true,
      motto: true,
      website: true,
      logoUrl: true,
      currency: true,
      timezone: true,
      primaryColor: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          memberships: true,
          students: true,
          subscriptions: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Get schools with expiring subscriptions. */
export async function getSchoolsWithExpiringSubscriptions(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  return db.school.findMany({
    where: {
      subscriptions: {
        some: {
          status: { in: ["ACTIVE", "GRACE_PERIOD", "TRIAL"] },
          endDate: { lte: cutoff, not: null },
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptions: {
        where: {
          status: { in: ["ACTIVE", "GRACE_PERIOD", "TRIAL"] },
          endDate: { lte: cutoff, not: null },
        },
        include: { plan: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { subscriptions: { _count: "desc" } },
  });
}

/** Get total user counts across platform. */
export async function getPlatformUserCounts(): Promise<{
  totalUsers: number;
  superAdmins: number;
  support: number;
}> {
  const [totalUsers, superAdmins, support] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { platformRole: "SUPER_ADMIN" } }),
    db.user.count({ where: { platformRole: "SUPPORT" } }),
  ]);
  return { totalUsers, superAdmins, support };
}

/** Get total students across all schools. */
export async function getTotalStudents(): Promise<number> {
  return db.student.count();
}