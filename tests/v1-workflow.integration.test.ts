/**
 * Version 1 SaaS workflow — live-database end-to-end (Phase 16).
 *
 * Exercises the exact platform flow against the database named by
 * DATABASE_URL: create a school, provision a school administrator (temp
 * password + forced change), assign the "Version 1" plan, charge the $300 via
 * the mock provider, verify the renewal, and prove isolation between two
 * schools. Also covers the new money-unit formatting and the searchable /
 * filterable / paginated school list.
 *
 * Fixtures live under the `e2e-` prefix and are cleaned at the start of every
 * run (idempotent).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import { createSchool, listSchoolsPage } from "@/server/services/admin-schools";
import { provisionSchoolAdminWithAudit } from "@/server/services/school-admin-provisioning";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSubscription, listSubscriptionEvents } from "@/server/services/school-subscriptions";
import { initiateSubscriptionPayment, verifyAndApplyPayment } from "@/server/integrations/payments/payment-service";
import { makeIdempotencyKey } from "@/lib/integrations";
import { formatMoneyMinor } from "@/lib/format";

const V1_SLUG = "school-management-saas-version-1";

let F: {
  superAdmin: { id: string } | null;
  planV1: { id: string; annualPrice: number } | null;
};

beforeAll(async () => {
  F = { superAdmin: null, planV1: null };

  const emails = ["e2e.admin.a@example.com", "e2e.admin.b@example.com"];
  const e2eUsers = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const e2eUserIds = e2eUsers.map((u) => u.id);
  const e2eSchools = await db.school.findMany({
    where: { slug: { startsWith: "e2e-" } },
    select: { id: true },
  });
  const e2eSchoolIds = e2eSchools.map((s) => s.id);

  if (e2eSchoolIds.length > 0) {
    await db.paymentTransaction.deleteMany({ where: { schoolId: { in: e2eSchoolIds } } });
  }
  if (e2eUserIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: e2eUserIds } } });
  }
  await db.school.deleteMany({ where: { slug: { startsWith: "e2e-" } } });
  await db.user.deleteMany({ where: { email: { in: emails } } });

  const superAdmin = await db.user.findFirst({
    where: { platformRole: "SUPER_ADMIN" },
    select: { id: true },
  });
  const planV1 = await db.subscriptionPlan.findUnique({
    where: { slug: V1_SLUG },
    select: { id: true, annualPrice: true },
  });

  F = { superAdmin, planV1 };
});

describe("Version 1 plan records money in minor units", () => {
  it("stores $300 as 30000 cents", () => {
    expect(F.planV1).not.toBeNull();
    expect(F.planV1!.annualPrice).toBe(30000);
  });

  it("formats minor units as dollars", () => {
    expect(formatMoneyMinor(30000, "USD")).toBe("$300.00");
    expect(formatMoneyMinor(2500, "USD")).toBe("$25.00");
    expect(formatMoneyMinor(null, "USD")).toBe("—");
  });
});

describe("Version 1 end-to-end workflow", () => {
  let schoolA: { id: string };
  let schoolB: { id: string };
  let adminA: { id: string; email: string };
  let tempPassword: string;

  beforeAll(async () => {
    expect(F.superAdmin).not.toBeNull();
    expect(F.planV1).not.toBeNull();

    schoolA = await createSchool({
      name: "e2e School A",
      slug: "e2e-school-a",
      email: "e2e.schoola@example.com",
    });
    schoolB = await createSchool({
      name: "e2e School B",
      slug: "e2e-school-b",
      email: "e2e.schoolb@example.com",
    });

    const provisionedA = await provisionSchoolAdminWithAudit({
      actorId: F.superAdmin!.id,
      schoolId: schoolA.id,
      email: "e2e.admin.a@example.com",
      name: "e2e Admin A",
    });
    expect(provisionedA.ok).toBe(true);
    if (!provisionedA.ok) throw new Error(provisionedA.error);
    tempPassword = provisionedA.temporaryPassword;
    adminA = { id: provisionedA.userId, email: provisionedA.email };

    const provisionedB = await provisionSchoolAdminWithAudit({
      actorId: F.superAdmin!.id,
      schoolId: schoolB.id,
      email: "e2e.admin.b@example.com",
      name: "e2e Admin B",
    });
    expect(provisionedB.ok).toBe(true);
    if (!provisionedB.ok) throw new Error(provisionedB.error);
  });

  it("provisions the admin with a forced first-login password change", async () => {
    const user = await db.user.findUnique({
      where: { id: adminA.id },
      select: {
        mustChangePassword: true,
        temporaryPasswordExpiresAt: true,
        passwordChangedAt: true,
        passwordHash: true,
      },
    });
    expect(user).toMatchObject({
      mustChangePassword: true,
      passwordChangedAt: null,
    });
    expect(user!.temporaryPasswordExpiresAt).not.toBeNull();
    expect(await verifyPassword(tempPassword, user!.passwordHash!)).toBe(true);

    const membership = await db.membership.findUnique({
      where: { schoolId_userId: { schoolId: schoolA.id, userId: adminA.id } },
      select: { role: true },
    });
    expect(membership?.role).toBe("SCHOOL_ADMIN");
  });

  it("lets the admin set a real password and invalidates the temp one", async () => {
    const newPassword = "e2e-Secure-Pass!42";
    await db.user.update({
      where: { id: adminA.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });

    const user = await db.user.findUnique({
      where: { id: adminA.id },
      select: { passwordHash: true, mustChangePassword: true, passwordChangedAt: true },
    });
    expect(user!.mustChangePassword).toBe(false);
    expect(user!.passwordChangedAt).not.toBeNull();
    expect(await verifyPassword(newPassword, user!.passwordHash!)).toBe(true);
    expect(await verifyPassword(tempPassword, user!.passwordHash!)).toBe(false);
  });

  it("rejects re-provisioning an admin that already has a password", async () => {
    const again = await provisionSchoolAdminWithAudit({
      actorId: F.superAdmin!.id,
      schoolId: schoolA.id,
      email: adminA.email,
    });
    expect(again.ok).toBe(false);
  });

  it("assigns the Version 1 plan and chargeable amount is exactly $300", async () => {
    const sub = await createSubscription({
      schoolId: schoolA.id,
      planId: F.planV1!.id,
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdById: F.superAdmin!.id,
    });
    expect(sub.status).toBe("ACTIVE");

    const key = makeIdempotencyKey([
      F.superAdmin!.id,
      "subscription",
      schoolA.id,
      F.planV1!.id,
      F.planV1!.annualPrice,
      new Date().toISOString().slice(0, 10),
    ]);

    const init = await initiateSubscriptionPayment({
      schoolId: schoolA.id,
      subscriptionId: sub.id,
      amountMinor: F.planV1!.annualPrice,
      currency: "USD",
      idempotencyKey: key,
      initiatedById: F.superAdmin!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const pendingTx = await db.paymentTransaction.findUnique({
      where: { id: init.transactionId },
      select: { amount: true, status: true, purpose: true },
    });
    expect(pendingTx!.status).toBe("PENDING");
    expect(pendingTx!.amount.toNumber()).toBe(300.0);

    const verified = await verifyAndApplyPayment(init.transactionId, { verifiedById: F.superAdmin!.id });
    expect(verified).toMatchObject({ ok: true, status: "SUCCEEDED" });

    const renewed = await db.schoolSubscription.findUnique({
      where: { id: sub.id },
      select: { status: true, paymentRef: true, providerReference: true, endDate: true },
    });
    expect(renewed!.status).toBe("ACTIVE");
    expect(renewed!.paymentRef).toBe(init.providerReference);
    expect(renewed!.providerReference).toBe(init.providerReference);

    const events = await listSubscriptionEvents(schoolA.id);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["CREATED", "RENEWED"]));
    expect(events[0].type).toBe("RENEWED");

    const renewalEvent = await db.subscriptionEvent.findFirst({
      where: { subscriptionId: sub.id, type: "RENEWED" },
      orderBy: { createdAt: "desc" },
      select: { reference: true },
    });
    expect(renewalEvent!.reference).toBe(init.providerReference);
  });

  it("keeps the two schools isolated", async () => {
    const adminAInB = await db.membership.findUnique({
      where: { schoolId_userId: { schoolId: schoolB.id, userId: adminA.id } },
    });
    const adminBInA = await db.membership.findUnique({
      where: { schoolId_userId: { schoolId: schoolA.id, userId: adminA.id } },
    });
    expect(adminAInB).toBeNull();
    expect(adminBInA).not.toBeNull();

    const otherUser = await db.user.findFirst({
      where: { email: "e2e.admin.b@example.com" },
      select: { id: true },
    });
    const adminBInA2 = await db.membership.findUnique({
      where: { schoolId_userId: { schoolId: schoolA.id, userId: otherUser!.id } },
    });
    expect(adminBInA2).toBeNull();
  });

  it("records the platform audit trail for provisioning and subscription", async () => {
    const schoolAudits = await db.auditLog.findMany({
      where: { schoolId: schoolA.id },
      select: { action: true, actorId: true },
      orderBy: { createdAt: "asc" },
    });
    const actions = schoolAudits.map((a) => a.action);
    expect(actions).toContain("SCHOOL_ADMIN_PROVISION");
    expect(actions).toContain("PAYMENT_INITIATED");
    expect(actions).toContain("PAYMENT_VERIFIED");
    expect(actions).toContain("SUBSCRIPTION_STATUS_CHANGE");
    expect(schoolAudits.some((a) => a.actorId === F.superAdmin!.id)).toBe(true);
  });
});

describe("Admin school list: search, filter, pagination", () => {
  it("searches by name/slug and filters by status", async () => {
    const all = await listSchoolsPage({ search: "nonexistent-nope", page: 1, pageSize: 20 });
    expect(all.total).toBe(0);

    const search = await listSchoolsPage({ search: "e2e", page: 1, pageSize: 20 });
    expect(search.total).toBe(2);
    expect(search.items.map((s) => s.slug).sort()).toEqual(["e2e-school-a", "e2e-school-b"]);

    const active = await listSchoolsPage({ search: "e2e", status: "ACTIVE", page: 1, pageSize: 20 });
    expect(active.total).toBe(2);

    const archived = await listSchoolsPage({ search: "e2e", status: "ARCHIVED", page: 1, pageSize: 20 });
    expect(archived.total).toBe(0);
  });

  it("paginates with a correct page count", async () => {
    const first = await listSchoolsPage({ search: "e2e", page: 1, pageSize: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.total).toBe(2);
    expect(first.totalPages).toBe(2);

    const second = await listSchoolsPage({ search: "e2e", page: 2, pageSize: 1 });
    expect(second.items).toHaveLength(1);

    const outOfRange = await listSchoolsPage({ search: "e2e", page: 99, pageSize: 1 });
    expect(outOfRange.items).toHaveLength(0);
    expect(outOfRange.totalPages).toBe(2);
  });
});