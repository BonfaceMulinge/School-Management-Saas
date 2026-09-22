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

const SCHOOLS_PAGE_SIZE = 20;

/**
 * Paginated school list with name/slug/email search and status filter
 * (platform staff only). Keeps the unfiltered `listSchools` for dropdowns.
 */
export async function listSchoolsPage(filter: {
  search?: string;
  status?: SchoolStatus | "ALL";
  page?: number;
  pageSize?: number;
}): Promise<{
  items: Array<{
    id: string;
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    currency: string;
    status: SchoolStatus;
    createdAt: Date;
    _count: { memberships: number; students: number };
    administrator: { name: string | null; email: string } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.floor(filter.pageSize ?? SCHOOLS_PAGE_SIZE))
  );
  const search = filter.search?.trim();
  const status =
    filter.status && filter.status !== "ALL" ? filter.status : undefined;

  // Search matches school fields and the school's administrators.
  const where = {
    AND: [
      ...(status ? [{ status }] : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { slug: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                {
                  memberships: {
                    some: {
                      role: "SCHOOL_ADMIN" as const,
                      user: { name: { contains: search, mode: "insensitive" as const } },
                    },
                  },
                },
                {
                  memberships: {
                    some: {
                      role: "SCHOOL_ADMIN" as const,
                      user: { email: { contains: search, mode: "insensitive" as const } },
                    },
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };

  const select = {
    id: true,
    name: true,
    slug: true,
    email: true,
    phone: true,
    currency: true,
    status: true,
    createdAt: true,
    _count: {
      select: { memberships: true, students: true },
    },
    memberships: {
      where: { role: "SCHOOL_ADMIN" as const },
      take: 1,
      select: { user: { select: { name: true, email: true } } },
    },
  } as const;

  const [total, items] = await Promise.all([
    db.school.count({ where }),
    db.school.findMany({
      where,
      select,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows = items.map(({ memberships, ...school }) => ({
    ...school,
    administrator: memberships[0]?.user ?? null,
  }));

  return {
    items: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
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
    provider: string | null;
    providerReference: string | null;
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
        include: {
          plan: { select: { id: true, name: true, studentLimit: true, staffLimit: true } },
        },
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