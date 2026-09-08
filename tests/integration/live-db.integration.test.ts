/**
 * Live-database integration tests (Phase 14 — PostgreSQL runtime verification).
 *
 * These tests run directly against the local PostgreSQL instance named by
 * DATABASE_URL (loaded from `.env` via `tests/setup-env.ts`). They exercise
 * the app's real service modules (tenant scoping, finance ledger, subscription
 * enforcement) and the schema's tenant-scoped constraints, mimicking exactly
 * the queries the application performs. Fixtures are created under the
 * `itest` prefix and are cleaned up at the start of every run (idempotent).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/server/db";
import { studentsScopeWhere, canViewStudent, resolveEnrollmentTarget, getStudentInSchool } from "@/server/services/students";
import { buildStudentLedger, findDuplicateFeeStructure } from "@/server/services/finance";
import {
  checkSchoolSubscriptionAccess,
  checkUsageLimits,
  enforceUsageLimit,
  assertUsageCapacityTx,
  UsageLimitError,
} from "@/server/services/subscription-enforcement";
import {
  createSubscription,
  setSubscriptionStatus,
  updateSubscription,
  getSubscriptionWithUsage,
} from "@/server/services/school-subscriptions";
import {
  initiateFeePayment,
  initiateSubscriptionPayment,
  verifyAndApplyPayment,
  processProviderWebhook,
} from "@/server/integrations/payments/payment-service";
import { MockPaymentProvider } from "@/server/integrations/payments/mock-provider";
import { makeIdempotencyKey, hmacSha256Hex, toMinorUnits } from "@/lib/integrations";
import { Prisma } from "@/generated/prisma/client";
import type { SchoolAccess } from "@/server/authorization";
import type { SessionUser } from "@/server/auth";

function makeAccess(
  user: { id: string; email: string; name: string | null },
  schoolId: string,
  role: NonNullable<SchoolAccess["membership"]>["role"]
): SchoolAccess {
  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: null,
    platformRole: null,
    mustChangePassword: false,
  };
  return {
    user: sessionUser,
    schoolId,
    membership: { id: `itest-membership-${user.id}-${schoolId}`, schoolId, userId: user.id, role },
    isPlatformStaff: false,
  };
}

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function expectPrismaError(promise: Promise<unknown>, code: "P2002" | "P2025" | "P2010") {
  try {
    await promise;
    throw new Error(`Expected Prisma error ${code}, but the operation succeeded.`);
  } catch (e) {
    expect(e).toMatchObject({ code });
  }
}

const WINDOW_START = new Date("2026-01-01T00:00:00.000Z");
const WINDOW_END = new Date("2030-01-01T00:00:00.000Z");

const F = {
  superUser: null as { id: string; email: string; name: string | null } | null,
  adminA: null as { id: string; email: string; name: string | null } | null,
  adminB: null as { id: string; email: string; name: string | null } | null,
  teacherUser: null as { id: string; email: string; name: string | null } | null,
  parentUser: null as { id: string; email: string; name: string | null } | null,
  studentUser: null as { id: string; email: string; name: string | null } | null,
  schoolA: null as { id: string; slug: string } | null,
  schoolB: null as { id: string; slug: string } | null,
  yearA: null as { id: string } | null,
  termA: null as { id: string; startDate: Date } | null,
  classA: null as { id: string } | null,
  classB: null as { id: string } | null,
  streamA: null as { id: string } | null,
  streamB: null as { id: string } | null,
  subjectMath: null as { id: string } | null,
  sA1: null as { id: string } | null,
  sA2: null as { id: string } | null,
  sB1: null as { id: string } | null,
  planTwo: null as { id: string } | null,
  planUnlimited: null as { id: string } | null,
  subscriptionA: null as { id: string } | null,
  item1: null as { id: string } | null,
  structureA: null as { id: string } | null,
};

beforeAll(async () => {
  process.env.PAYMENT_PROVIDER_KEY = "itest-webhook-secret";

  const schools = await db.school.findMany({
    where: { slug: { startsWith: "itest-" } },
    select: { id: true },
  });
  const userIds = (
    await db.user.findMany({
      where: { email: { startsWith: "itest." } },
      select: { id: true },
    })
  ).map((u) => u.id);
  const schoolIds = schools.map((s) => s.id);

  if (schoolIds.length > 0) {
    await db.paymentTransaction.deleteMany({ where: { schoolId: { in: schoolIds } } });
    await db.outboundMessage.deleteMany({ where: { schoolId: { in: schoolIds } } });
  }
  await db.webhookEvent.deleteMany({});
  await db.integrationConfig.deleteMany({ where: { channel: { in: ["PAYMENT", "EMAIL", "SMS"] } } });

  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  }
  if (schoolIds.length > 0) {
    const examIds = (
      await db.exam.findMany({ where: { schoolId: { in: schoolIds } }, select: { id: true } })
    ).map((e) => e.id);
    if (examIds.length > 0) {
      await db.examMark.deleteMany({ where: { examId: { in: examIds } } });
      await db.examSubject.deleteMany({ where: { examId: { in: examIds } } });
    }
    await db.teacherAssignment.deleteMany({ where: { schoolId: { in: schoolIds } } });
  }
  await db.school.deleteMany({ where: { slug: { startsWith: "itest-" } } });
  await db.subscriptionPlan.deleteMany({ where: { slug: { startsWith: "itest-plan-" } } });
  await db.user.deleteMany({ where: { email: { startsWith: "itest." } } });

  const superUser = await db.user.create({
    data: { email: "itest.superadmin@example.com", name: "itest Super", platformRole: "SUPER_ADMIN" },
  });
  const adminA = await db.user.create({
    data: { email: "itest.admina@example.com", name: "itest Admin A" },
  });
  const adminB = await db.user.create({
    data: { email: "itest.adminb@example.com", name: "itest Admin B" },
  });
  const teacherUser = await db.user.create({
    data: { email: "itest.teacher@example.com", name: "itest Teacher" },
  });
  const parentUser = await db.user.create({
    data: { email: "itest.parent@example.com", name: "itest Parent" },
  });
  const studentUser = await db.user.create({
    data: { email: "itest.student@example.com", name: "itest Student" },
  });

  const schoolA = await db.school.create({
    data: { name: "itest Alpha Academy", slug: "itest-alpha", email: "itest.alpha@example.com" },
  });
  await db.schoolSettings.create({ data: { schoolId: schoolA.id } });
  await db.schoolOnboarding.create({ data: { schoolId: schoolA.id, completed: true, completedAt: new Date() } });

  const schoolB = await db.school.create({
    data: { name: "itest Beta School", slug: "itest-beta", email: "itest.beta@example.com" },
  });
  await db.schoolSettings.create({ data: { schoolId: schoolB.id } });
  await db.schoolOnboarding.create({ data: { schoolId: schoolB.id, completed: true, completedAt: new Date() } });

  await db.membership.createMany({
    data: [
      { schoolId: schoolA.id, userId: adminA.id, role: "SCHOOL_ADMIN" },
      { schoolId: schoolB.id, userId: adminB.id, role: "SCHOOL_ADMIN" },
      { schoolId: schoolA.id, userId: teacherUser.id, role: "TEACHER" },
      { schoolId: schoolA.id, userId: parentUser.id, role: "PARENT" },
      { schoolId: schoolA.id, userId: studentUser.id, role: "STUDENT" },
    ],
  });

  const yearA = await db.academicYear.create({
    data: { schoolId: schoolA.id, name: "itest Year 2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isActive: true },
  });
  const yearB = await db.academicYear.create({
    data: { schoolId: schoolB.id, name: "itest Year 2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), isActive: true },
  });
  const termA = await db.term.create({
    data: { academicYearId: yearA.id, name: "itest Term 1", startDate: new Date("2026-01-10"), endDate: new Date("2026-04-10"), isActive: true },
  });
  const termB = await db.term.create({
    data: { academicYearId: yearB.id, name: "itest Term 1", startDate: new Date("2026-01-10"), endDate: new Date("2026-04-10"), isActive: true },
  });

  const classA = await db.class.create({ data: { schoolId: schoolA.id, name: "Grade 4" } });
  const classB = await db.class.create({ data: { schoolId: schoolB.id, name: "Grade 4" } });
  const streamA = await db.stream.create({ data: { classId: classA.id, name: "North" } });
  const streamB = await db.stream.create({ data: { classId: classB.id, name: "North" } });
  const subjectMath = await db.subject.create({ data: { schoolId: schoolA.id, name: "Mathematics", code: "MATH" } });

  await db.teacherAssignment.create({
    data: { schoolId: schoolA.id, teacherId: teacherUser.id, classId: classA.id, subjectId: subjectMath.id },
  });

  const sA1 = await db.student.create({
    data: { schoolId: schoolA.id, firstName: "itest", lastName: "Alpha One", studentNo: "itest-A1" },
  });
  const sA2 = await db.student.create({
    data: { schoolId: schoolA.id, firstName: "itest", lastName: "Alpha Two", studentNo: "itest-A2", userId: studentUser.id },
  });
  const sB1 = await db.student.create({
    data: { schoolId: schoolB.id, firstName: "itest", lastName: "Beta One", studentNo: "itest-B1" },
  });

  await db.enrollment.createMany({
    data: [
      { schoolId: schoolA.id, studentId: sA1.id, classId: classA.id, academicYearId: yearA.id, termId: termA.id, status: "ACTIVE" },
      { schoolId: schoolA.id, studentId: sA2.id, classId: classA.id, academicYearId: yearA.id, termId: termA.id, status: "ACTIVE" },
      { schoolId: schoolB.id, studentId: sB1.id, classId: classB.id, academicYearId: yearB.id, termId: termB.id, status: "ACTIVE" },
    ],
  });

  const planTwo = await db.subscriptionPlan.create({
    data: { name: "itest Two-student plan", slug: "itest-plan-2", annualPrice: 0, studentLimit: 2, createdById: superUser.id, updatedById: superUser.id },
  });
  const planUnlimited = await db.subscriptionPlan.create({
    data: { name: "itest Unlimited plan", slug: "itest-plan-unlimited", annualPrice: 0, studentLimit: null, createdById: superUser.id, updatedById: superUser.id },
  });

  const subscriptionA = await createSubscription({
    schoolId: schoolA.id,
    planId: planTwo.id,
    status: "TRIAL",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2027-01-01"),
    createdById: superUser.id,
  });

  const structureA = await db.feeStructure.create({
    data: {
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      termId: termA.id,
      classId: classA.id,
      name: "itest Term Fees",
    },
  });
  const item1 = await db.feeStructureItem.create({
    data: { structureId: structureA.id, name: "Tuition", amount: 5000.75 },
  });
  await db.feeStructureItem.create({
    data: { structureId: structureA.id, name: "Transport", amount: 1250.25 },
  });
  await db.feeStructure.create({
    data: {
      schoolId: schoolA.id,
      academicYearId: yearA.id,
      termId: termA.id,
      classId: classA.id,
      streamId: streamA.id,
      name: "itest Stream Fees",
    },
  });

  await db.integrationConfig.create({
    data: {
      channel: "PAYMENT",
      provider: "mock",
      mode: "SANDBOX",
      enabled: true,
      meta: { test: true },
    },
  });

  Object.assign(F, {
    superUser,
    adminA,
    adminB,
    teacherUser,
    parentUser,
    studentUser,
    schoolA,
    schoolB,
    yearA,
    termA,
    classA,
    classB,
    streamA,
    streamB: { id: streamB.id },
    subjectMath,
    sA1,
    sA2,
    sB1,
    planTwo,
    planUnlimited,
    subscriptionA,
    item1,
    structureA,
  });
});

describe("Tenant isolation (two schools)", () => {
  it("scopes admin queries to their own school only", async () => {
    const accessA = makeAccess(F.adminA!, F.schoolA!.id, "SCHOOL_ADMIN");
    const accessB = makeAccess(F.adminB!, F.schoolB!.id, "SCHOOL_ADMIN");

    const schoolAstudents = await db.student.findMany({
      where: { schoolId: F.schoolA!.id, ...(await studentsScopeWhere(accessA)) },
      select: { id: true },
    });
    const schoolBstudents = await db.student.findMany({
      where: { schoolId: F.schoolB!.id, ...(await studentsScopeWhere(accessB)) },
      select: { id: true },
    });

    expect(schoolAstudents.map((s) => s.id).sort()).toEqual([F.sA1!.id, F.sA2!.id].sort());
    expect(schoolBstudents.map((s) => s.id)).toEqual([F.sB1!.id]);
    expect(schoolAstudents.map((s) => s.id)).not.toContain(F.sB1!.id);
    expect(schoolBstudents.map((s) => s.id)).not.toContain(F.sA1!.id);
  });

  it("denies cross-school profile access", async () => {
    const accessA = makeAccess(F.adminA!, F.schoolA!.id, "SCHOOL_ADMIN");
    const accessB = makeAccess(F.adminB!, F.schoolB!.id, "SCHOOL_ADMIN");

    expect(await canViewStudent(accessA, F.sB1!.id)).toBe(false);
    expect(await canViewStudent(accessB, F.sA1!.id)).toBe(false);
    expect(await canViewStudent(accessA, F.sA1!.id)).toBe(true);
  });

  it("loads a student only when it belongs to the tenant", async () => {
    expect(await getStudentInSchool(F.schoolA!.id, F.sB1!.id)).toBe(null);
    expect(await getStudentInSchool(F.schoolA!.id, F.sA1!.id)).not.toBe(null);
  });

  it("lets two tenants use the same class name (tenant-scoped unique)", async () => {
    const counts = await db.class.findMany({
      where: { name: "Grade 4" },
      select: { schoolId: true },
    });
    expect(counts).toHaveLength(2);
    expect(counts.map((c) => c.schoolId)).toEqual(expect.arrayContaining([F.schoolA!.id, F.schoolB!.id]));
  });

  it("scopes teachers to their assigned classes only", async () => {
    const teacherAccess = makeAccess(F.teacherUser!, F.schoolA!.id, "TEACHER");
    const visible = await db.student.findMany({
      where: { schoolId: F.schoolA!.id, ...(await studentsScopeWhere(teacherAccess)) },
      select: { id: true },
    });
    const visibleIds = visible.map((s) => s.id);
    expect(visibleIds).toEqual(expect.arrayContaining([F.sA1!.id, F.sA2!.id]));
    expect(visibleIds).not.toContain(F.sB1!.id);
    expect(await canViewStudent(teacherAccess, F.sB1!.id)).toBe(false);
    expect(await canViewStudent(teacherAccess, F.sA1!.id)).toBe(true);
  });

  it("scopes parents to their own children only", async () => {
    await db.guardian.create({
      data: { schoolId: F.schoolA!.id, studentId: F.sA1!.id, guardianUserId: F.parentUser!.id, isPrimary: true },
    });
    const parentAccess = makeAccess(F.parentUser!, F.schoolA!.id, "PARENT");
    expect(await canViewStudent(parentAccess, F.sA1!.id)).toBe(true);
    expect(await canViewStudent(parentAccess, F.sA2!.id)).toBe(false);
    expect(await canViewStudent(parentAccess, F.sB1!.id)).toBe(false);
  });

  it("scopes students to their own record only", async () => {
    const studentAccess = makeAccess(F.studentUser!, F.schoolA!.id, "STUDENT");
    expect(await canViewStudent(studentAccess, F.sA2!.id)).toBe(true);
    expect(await canViewStudent(studentAccess, F.sA1!.id)).toBe(false);
  });

  it("rejects enrollment targets from another tenant", async () => {
    const cross = await resolveEnrollmentTarget(F.schoolA!.id, F.classB!.id, F.yearA!.id, null, null);
    expect(cross).toBe(null);

    const badStream = await resolveEnrollmentTarget(
      F.schoolA!.id,
      F.classA!.id,
      F.yearA!.id,
      F.streamB!.id,
      null
    );
    expect(badStream).toBe(null);

    const valid = await resolveEnrollmentTarget(F.schoolA!.id, F.classA!.id, F.yearA!.id, null, F.termA!.id);
    expect(valid).toEqual({
      classId: F.classA!.id,
      streamId: null,
      academicYearId: F.yearA!.id,
      termId: F.termA!.id,
    });
  });

  it("keeps attendance records tenant-scoped", async () => {
    const day = today();
    await db.attendance.create({
      data: {
        schoolId: F.schoolA!.id,
        studentId: F.sA1!.id,
        recordedById: F.adminA!.id,
        date: day,
        status: "PRESENT",
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
      },
    });

    const inB = await db.attendance.findFirst({
      where: { schoolId: F.schoolB!.id, date: day, studentId: F.sA1!.id },
    });
    expect(inB).toBe(null);

    const inA = await db.attendance.findFirst({
      where: { schoolId: F.schoolA!.id, date: day, studentId: F.sA1!.id },
    });
    expect(inA).not.toBe(null);
  });
});

describe("Financial integrity (Decimal money, ledger, corrections, reversals)", () => {
  it("is exact with decimal money arithmetic (no float drift)", async () => {
    const credit1 = await db.feeStructureItem.create({
      data: { structureId: F.structureA!.id, name: "itest Float 1", amount: 0.1 },
    });
    const credit2 = await db.feeStructureItem.create({
      data: { structureId: F.structureA!.id, name: "itest Float 2", amount: 0.2 },
    });
    const w = await db.studentCharge.create({
      data: {
        schoolId: F.schoolA!.id,
        structureId: F.structureA!.id,
        structureItemId: credit1.id,
        studentId: F.sA2!.id,
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        itemName: "itest Float 1",
        amount: 0.1,
        recordedById: F.adminA!.id,
      },
    });
    await db.studentCharge.create({
      data: {
        schoolId: F.schoolA!.id,
        structureId: F.structureA!.id,
        structureItemId: credit2.id,
        studentId: F.sA2!.id,
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        itemName: "itest Float 2",
        amount: 0.2,
        recordedById: F.adminA!.id,
      },
    });
    const stored = await db.studentCharge.findUnique({ where: { id: w.id }, select: { amount: true } });
    expect(stored!.amount.toNumber()).toBe(0.1);

    const ledger = await buildStudentLedger(F.schoolA!.id, F.sA2!.id, WINDOW_START, WINDOW_END);
    expect(ledger.charges).toBe(0.3);
  });

  it("stores money in numeric(12,2) columns", async () => {
    const col = await db.$queryRaw<Array<{ numeric_precision: number; numeric_scale: number }>>`
      SELECT numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'FeePayment' AND column_name = 'amount'
    `;
    expect(col[0]).toMatchObject({ numeric_precision: 12, numeric_scale: 2 });
  });

  it("rejects duplicate charges per (school, item, student, year, term)", async () => {
    await db.studentCharge.create({
      data: {
        schoolId: F.schoolA!.id,
        structureId: F.structureA!.id,
        structureItemId: F.item1!.id,
        studentId: F.sA1!.id,
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        itemName: "Tuition",
        amount: 5000.75,
        recordedById: F.adminA!.id,
      },
    });

    await expectPrismaError(
      db.studentCharge.create({
        data: {
          schoolId: F.schoolA!.id,
          structureId: F.structureA!.id,
          structureItemId: F.item1!.id,
          studentId: F.sA1!.id,
          academicYearId: F.yearA!.id,
          termId: F.termA!.id,
          classId: F.classA!.id,
          itemName: "Tuition",
          amount: 5000.75,
        },
      }),
      "P2002"
    );
  });

  it("builds an exact ledger from charges and payments", async () => {
    await db.studentCharge.create({
      data: {
        schoolId: F.schoolA!.id,
        structureId: F.structureA!.id,
        structureItemId: (
          await db.feeStructureItem.findFirst({
            where: { structureId: F.structureA!.id, name: "Transport" },
            select: { id: true },
          })
        )!.id,
        studentId: F.sA1!.id,
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        itemName: "Transport",
        amount: 1250.25,
        recordedById: F.adminA!.id,
      },
    });

    await db.feePayment.create({
      data: {
        schoolId: F.schoolA!.id,
        studentId: F.sA1!.id,
        receiptNo: "itest-REC-100",
        amount: 100.0,
        date: today(),
        method: "CASH",
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        recordedById: F.adminA!.id,
      },
    });

    const ledger = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    expect(ledger.charges).toBe(6251.0);
    expect(ledger.paid).toBe(100.0);
    expect(ledger.closing).toBe(6151.0);
    expect(ledger.rows.some((r) => r.kind === "PAYMENT" && r.description.includes("itest-REC-100"))).toBe(true);
  });

  it("rejects a duplicate receipt number within a school but allows it in another tenant", async () => {
    await expectPrismaError(
      db.feePayment.create({
        data: {
          schoolId: F.schoolA!.id,
          studentId: F.sA1!.id,
          receiptNo: "itest-REC-100",
          amount: 999.0,
          date: today(),
          method: "CASH",
          academicYearId: F.yearA!.id,
          termId: F.termA!.id,
          classId: F.classA!.id,
          recordedById: F.adminA!.id,
        },
      }),
      "P2002"
    );

    const bTerm = await db.term.findFirst({
      where: { academicYear: { schoolId: F.schoolB!.id } },
      select: { id: true, academicYearId: true },
    });
    await db.feePayment.create({
      data: {
        schoolId: F.schoolB!.id,
        studentId: F.sB1!.id,
        receiptNo: "itest-REC-100",
        amount: 50.0,
        date: today(),
        method: "BANK",
        academicYearId: bTerm!.academicYearId,
        termId: bTerm!.id,
        classId: F.classB!.id,
        recordedById: F.adminB!.id,
      },
    });
  });

  it("records a correction and keeps the immutable trail", async () => {
    const payment = await db.feePayment.create({
      data: {
        schoolId: F.schoolA!.id,
        studentId: F.sA1!.id,
        receiptNo: "itest-REC-150",
        amount: 100.0,
        date: today(),
        method: "CASH",
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        recordedById: F.adminA!.id,
      },
    });

    await db.paymentAdjustment.create({
      data: {
        schoolId: F.schoolA!.id,
        paymentId: payment.id,
        type: "CORRECT",
        oldAmount: 100.0,
        newAmount: 150.0,
        oldDate: today(),
        newDate: today(),
        oldMethod: "CASH",
        newMethod: "BANK",
        reason: "itest amount correction",
        recordedById: F.adminA!.id,
      },
    });
    await db.feePayment.update({ where: { id: payment.id }, data: { amount: 150.0, method: "BANK" } });

    const adjustments = await db.paymentAdjustment.findMany({ where: { paymentId: payment.id } });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ type: "CORRECT", reason: "itest amount correction" });
    expect(adjustments[0].oldAmount.toNumber()).toBe(100.0);
    expect(adjustments[0].newAmount!.toNumber()).toBe(150.0);

    const ledger = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    expect(ledger.paid).toBe(100.0 + 150.0);
  });

  it("reverses a payment without destroying history", async () => {
    const payment = await db.feePayment.findFirst({ where: { receiptNo: "itest-REC-150" }, select: { id: true } });
    await db.paymentAdjustment.create({
      data: {
        schoolId: F.schoolA!.id,
        paymentId: payment!.id,
        type: "REVERSE",
        oldAmount: 150.0,
        newAmount: null,
        reason: "itest recorded in error",
        recordedById: F.adminA!.id,
      },
    });
    await db.feePayment.update({
      where: { id: payment!.id },
      data: { status: "REVERSED", reversedById: F.adminA!.id, reversedAt: new Date() },
    });

    const kept = await db.feePayment.findUnique({ where: { id: payment!.id } });
    expect(kept).toMatchObject({ receiptNo: "itest-REC-150", status: "REVERSED" });
    expect(kept!.reversedById).toBe(F.adminA!.id);

    const ledger = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    expect(ledger.paid).toBe(100.0);
    expect(ledger.rows.some((r) => r.kind === "REVERSAL" && r.amount === -150.0)).toBe(true);
  });

  it("applies a charge adjustment and reflects it in the ledger", async () => {
    const chargeId = (
      await db.studentCharge.findFirst({
        where: { schoolId: F.schoolA!.id, studentId: F.sA1!.id, itemName: "Tuition" },
        select: { id: true },
      })
    )!.id;
    await db.chargeAdjustment.create({
      data: {
        schoolId: F.schoolA!.id,
        chargeId,
        studentId: F.sA1!.id,
        type: "DISCOUNT",
        amount: 75.55,
        reason: "itest sibling discount",
        recordedById: F.adminA!.id,
      },
    });

    const ledger = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    expect(ledger.adjustments).toBe(75.55);
    expect(ledger.closing).toBe(6251.0 - 75.55 - 100.0);
  });

  it("catches stream-wide duplicate fee structures the DB index cannot", async () => {
    expect(
      await findDuplicateFeeStructure(F.schoolA!.id, F.yearA!.id, F.termA!.id, F.classA!.id, null)
    ).toBe(true);
    expect(
      await findDuplicateFeeStructure(F.schoolA!.id, F.yearA!.id, F.termA!.id, F.classA!.id, F.streamA!.id)
    ).toBe(true);
    expect(
      await findDuplicateFeeStructure(F.schoolB!.id, F.yearA!.id, F.termA!.id, F.classB!.id, null)
    ).toBe(false);
  });
});

describe("Subscription enforcement & lifecycle audit", () => {
  it("sees a trial subscription as active", async () => {
    const check = await checkSchoolSubscriptionAccess(F.schoolA!.slug);
    expect(check.allowed).toBe(true);
  });

  it("enforces student limits when the plan limit is reached", async () => {
    const usage = await checkUsageLimits(F.schoolA!.slug, "student");
    expect(usage).toMatchObject({ allowed: false, current: 2, limit: 2 });

    await expect(enforceUsageLimit(F.schoolA!.slug, "student")).rejects.toThrow(/Student limit \(2\) reached/);

    const result = await db.$transaction(async (tx) => {
      try {
        await assertUsageCapacityTx(tx, F.schoolA!.id, "student");
        return { threw: false };
      } catch (e) {
        return { threw: true, isUsage: e instanceof UsageLimitError, name: (e as Error).name };
      }
    }, { isolationLevel: "Serializable" });
    expect(result).toEqual({ threw: true, isUsage: true, name: "UsageLimitError" });
  });

  it("suspends a school and blocks subscription access", async () => {
    await setSubscriptionStatus(F.subscriptionA!.id, "SUSPENDED", F.superUser!.id, {
      reason: "itest suspension",
    });
    const check = await checkSchoolSubscriptionAccess(F.schoolA!.slug);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("Subscription is suspended");
  });

  it("re-activates via an unlimited plan and lifts the limit", async () => {
    await updateSubscription(F.subscriptionA!.id, { planId: F.planUnlimited!.id, updatedById: F.superUser!.id });
    await setSubscriptionStatus(F.subscriptionA!.id, "ACTIVE", F.superUser!.id);

    const check = await checkSchoolSubscriptionAccess(F.schoolA!.slug);
    expect(check.allowed).toBe(true);

    const usage = await checkUsageLimits(F.schoolA!.slug, "student");
    expect(usage).toMatchObject({ allowed: true, current: 2, limit: null });

    const result = await db.$transaction(async (tx) => {
      const cap = await assertUsageCapacityTx(tx, F.schoolA!.id, "student");
      await tx.student.create({
        data: { schoolId: F.schoolA!.id, firstName: "itest", lastName: "Capacity", studentNo: "itest-CAP" },
      });
      return cap;
    }, { isolationLevel: "Serializable" });
    expect(result).toMatchObject({ current: 0, limit: null });
  });

  it("keeps an immutable subscription event trail", async () => {
    const events = await db.subscriptionEvent.findMany({
      where: { subscriptionId: F.subscriptionA!.id },
      orderBy: { createdAt: "asc" },
      select: { type: true, fromStatus: true, toStatus: true },
    });
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      "CREATED",
      "STATUS_CHANGED",
      "PLAN_CHANGED",
      "STATUS_CHANGED",
    ]);
    expect(events[1].fromStatus).toBe("TRIAL");
    expect(events[1].toStatus).toBe("SUSPENDED");
    expect(events[3].toStatus).toBe("ACTIVE");

    const withUsage = await getSubscriptionWithUsage(F.schoolA!.id);
    if (!withUsage) throw new Error("expected subscription usage");
    expect(withUsage.studentCount).toBe(3);
  });
});

describe("Attendance & exam integrity", () => {
  it("rejects duplicate attendance for (school, student, date)", async () => {
    await expectPrismaError(
      db.attendance.create({
        data: {
          schoolId: F.schoolA!.id,
          studentId: F.sA1!.id,
          recordedById: F.adminA!.id,
          date: today(),
          status: "PRESENT",
          academicYearId: F.yearA!.id,
          termId: F.termA!.id,
          classId: F.classA!.id,
        },
      }),
      "P2002"
    );
  });

  it("preserves an attendance change trail", async () => {
    const attendance = (await db.attendance.findFirst({
      where: { schoolId: F.schoolA!.id, studentId: F.sA1!.id, date: today() },
      select: { id: true },
    }))!;
    await db.attendanceChange.create({
      data: {
        attendanceId: attendance.id,
        schoolId: F.schoolA!.id,
        changedById: F.adminA!.id,
        oldStatus: "PRESENT",
        newStatus: "ABSENT",
        reason: "itest late-afternoon excuse",
      },
    });
    await db.attendance.update({ where: { id: attendance.id }, data: { status: "ABSENT" } });

    const changes = await db.attendanceChange.findMany({ where: { attendanceId: attendance.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ oldStatus: "PRESENT", newStatus: "ABSENT", reason: "itest late-afternoon excuse" });
  });

  it("rejects a duplicate exam mark per (school, exam, subject, student)", async () => {
    const exam = await db.exam.create({
      data: {
        schoolId: F.schoolA!.id,
        name: "itest CAT 1",
        type: "CAT",
        date: today(),
        academicYearId: F.yearA!.id,
        termId: F.termA!.id,
        classId: F.classA!.id,
        streamId: F.streamA!.id,
        status: "COMPLETED",
        createdById: F.adminA!.id,
      },
    });
    const examSubject = await db.examSubject.create({
      data: { examId: exam.id, subjectId: F.subjectMath!.id, maxMarks: 100 },
    });
    const mark = await db.examMark.create({
      data: {
        schoolId: F.schoolA!.id,
        examId: exam.id,
        examSubjectId: examSubject.id,
        subjectId: F.subjectMath!.id,
        studentId: F.sA1!.id,
        marksObtained: 87.55,
        recordedById: F.adminA!.id,
      },
    });
    expect((await db.examMark.findUnique({ where: { id: mark.id } }))!.marksObtained.toNumber()).toBe(87.55);

    await expectPrismaError(
      db.examMark.create({
        data: {
          schoolId: F.schoolA!.id,
          examId: exam.id,
          examSubjectId: examSubject.id,
          subjectId: F.subjectMath!.id,
          studentId: F.sA1!.id,
          marksObtained: 90.0,
          recordedById: F.adminA!.id,
        },
      }),
      "P2002"
    );
  });

  it("writes FINANCIAL_ACTION audit rows at runtime", async () => {
    await db.auditLog.create({
      data: {
        schoolId: F.schoolA!.id,
        actorId: F.adminA!.id,
        action: "FINANCIAL_ACTION",
        entity: "FeePayment",
        entityId: "itest-REC-100",
        metadata: { receiptNo: "itest-REC-100", amount: 100 },
      },
    });
    const logs = await db.auditLog.findMany({ where: { entity: "FeePayment", entityId: "itest-REC-100" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("FINANCIAL_ACTION");
    expect(logs[0].schoolId).toBe(F.schoolA!.id);
  });
});

// ---------------------------------------------------------------------------
// Phase 15 — provider payments (mock provider, deterministic references)
// ---------------------------------------------------------------------------

describe("Payment lifecycle (Phase 15)", () => {
  const SECRET = "itest-webhook-secret";

  function feeKey(studentId: string, amount: string): string {
    return makeIdempotencyKey([F.adminA!.id, "fee", studentId, amount, today().toISOString().slice(0, 10)]);
  }

  function subKey(): string {
    return makeIdempotencyKey([
      F.adminA!.id,
      "subscription",
      F.schoolA!.id,
      "itest-plan-2",
      "0",
      today().toISOString().slice(0, 10),
    ]);
  }

  it("initiates a PENDING fee payment and dedupes the same idempotency key", async () => {
    const amount = new Prisma.Decimal("125.50");
    const key = feeKey(F.sA1!.id, "125.50");

    const first = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount,
      currency: "USD",
      idempotencyKey: key,
      initiatedById: F.adminA!.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.status).toBe("PENDING");
    expect(first.reused).toBe(false);
    expect(first.providerReference).toMatch(/^mock_tx_[0-9a-f]{16}$/);

    const second = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount,
      currency: "USD",
      idempotencyKey: key,
      initiatedById: F.adminA!.id,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);

    const tx = await db.paymentTransaction.findUnique({ where: { id: first.transactionId } });
    expect(tx).toMatchObject({
      status: "PENDING",
      purpose: "FEE_PAYMENT",
      provider: "mock",
      studentId: F.sA1!.id,
      currency: "USD",
    });
    expect(tx!.amount.toNumber()).toBe(125.5);
  });

  it("verifies a succeeded payment server-side and records an ONLINE fee payment + ledger row", async () => {
    const amount = new Prisma.Decimal("100.00");
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount,
      currency: "USD",
      idempotencyKey: feeKey(F.sA1!.id, "100.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const before = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    const verified = await verifyAndApplyPayment(init.transactionId, { verifiedById: F.adminA!.id });
    expect(verified).toMatchObject({ ok: true, status: "SUCCEEDED" });
    if (!verified.ok || verified.status !== "SUCCEEDED") return;

    const feePayment = await db.feePayment.findUnique({ where: { id: verified.feePaymentId! } });
    expect(feePayment).toMatchObject({
      method: "ONLINE",
      provider: "mock",
      recordedById: F.adminA!.id,
      verifiedById: F.adminA!.id,
    });
    expect(feePayment!.providerReference).toBe(init.providerReference);
    expect(feePayment!.amount.toNumber()).toBe(100.0);

    const tx = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(tx).toMatchObject({ status: "SUCCEEDED", feePaymentId: verified.feePaymentId });

    const after = await buildStudentLedger(F.schoolA!.id, F.sA1!.id, WINDOW_START, WINDOW_END);
    expect(after.paid - before.paid).toBe(100.0);

    // Repeated verification is safe: same fee payment, no second application.
    const reVerify = await verifyAndApplyPayment(init.transactionId, { verifiedById: F.adminA!.id });
    expect(reVerify).toMatchObject({ ok: true, status: "SUCCEEDED", feePaymentId: verified.feePaymentId });
    expect(await db.feePayment.count({ where: { id: verified.feePaymentId } })).toBe(1);
  });

  it("marks a payment FAILED when the provider reports failure and never creates a fee payment", async () => {
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA2!.id,
      amount: new Prisma.Decimal("50.00"),
      currency: "USD",
      idempotencyKey: feeKey(F.sA2!.id, "50.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const knownRef = init.providerReference!;
    const failing = await verifyAndApplyPayment(init.transactionId, {
      verifiedById: F.adminA!.id,
      providerOverride: new MockPaymentProvider({ secret: SECRET, failingReferences: [knownRef] }),
    });
    expect(failing).toMatchObject({ ok: true, status: "FAILED" });

    const tx = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(tx).toMatchObject({ status: "FAILED", failureReason: "Payment declined by the mock provider." });

    const payment = await db.feePayment.findFirst({ where: { referenceNo: knownRef } });
    expect(payment).toBeNull();
  });

  it("keeps a pending provider status PENDING — never trusts client-side success claims", async () => {
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount: new Prisma.Decimal("30.00"),
      currency: "USD",
      idempotencyKey: feeKey(F.sA1!.id, "30.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const knownRef = init.providerReference!;
    const pending = await verifyAndApplyPayment(init.transactionId, {
      verifiedById: F.adminA!.id,
      providerOverride: new MockPaymentProvider({ secret: SECRET, pendingReferences: [knownRef] }),
    });
    expect(pending).toMatchObject({ ok: true, status: "PENDING" });

    const stillPending = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(stillPending!.status).toBe("PENDING");

    // Once the provider reports success, the same transaction can be applied.
    const succeeded = await verifyAndApplyPayment(init.transactionId, {
      verifiedById: F.adminA!.id,
      providerOverride: new MockPaymentProvider({ secret: SECRET }),
    });
    expect(succeeded).toMatchObject({ ok: true, status: "SUCCEEDED" });
  });

  it("applies a webhook with a valid signature; replays are IGNORED", async () => {
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount: new Prisma.Decimal("75.00"),
      currency: "USD",
      idempotencyKey: feeKey(F.sA1!.id, "75.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const provider = new MockPaymentProvider({ secret: SECRET });
    const status = await provider.getStatus(init.providerReference!);
    const payload = {
      id: status.providerEventId,
      type: "payment.completed",
      data: {
        status: "succeeded",
        transactionReference: init.providerReference,
        amountMinor: 7500,
        currency: "USD",
        schoolRef: F.schoolA!.id,
      },
    };
    const rawBody = JSON.stringify(payload);
    const headers = { "x-mock-signature": hmacSha256Hex(SECRET, rawBody) };

    const processed = await processProviderWebhook({ providerName: "mock", headers, rawBody, payload });
    expect(processed).toMatchObject({ code: 200, status: "PROCESSED", note: "Applied successfully." });
    expect(processed.eventId).toBe(status.providerEventId);

    const tx = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(tx!.status).toBe("SUCCEEDED");
    expect(tx!.feePaymentId).toBeTruthy();

    const replayed = await processProviderWebhook({ providerName: "mock", headers, rawBody, payload });
    expect(replayed).toMatchObject({ code: 200, status: "IGNORED" });
    expect(replayed.eventId).toBe(status.providerEventId);

    const events = await db.webhookEvent.count({ where: { providerEventId: status.providerEventId! } });
    expect(events).toBe(1);
  });

  it("rejects a webhook with an invalid signature and persists nothing", async () => {
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA2!.id,
      amount: new Prisma.Decimal("90.00"),
      currency: "USD",
      idempotencyKey: feeKey(F.sA2!.id, "90.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const provider = new MockPaymentProvider({ secret: SECRET });
    const status = await provider.getStatus(init.providerReference!);
    const payload = {
      id: status.providerEventId,
      type: "payment.completed",
      data: { status: "succeeded", transactionReference: init.providerReference, amountMinor: 9000, currency: "USD" },
    };
    const rawBody = JSON.stringify(payload);
    const headers = { "x-mock-signature": hmacSha256Hex("WRONG-SECRET", rawBody) };

    const result = await processProviderWebhook({ providerName: "mock", headers, rawBody, payload });
    expect(result).toMatchObject({ code: 401, status: "FAILED" });

    const tx = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(tx!.status).toBe("PENDING");
    expect(await db.webhookEvent.count({ where: { providerEventId: status.providerEventId! } })).toBe(0);
  });

  it("rejects a webhook whose amount or school does not match the stored transaction", async () => {
    const init = await initiateFeePayment({
      schoolId: F.schoolA!.id,
      studentId: F.sA1!.id,
      amount: new Prisma.Decimal("60.00"),
      currency: "USD",
      idempotencyKey: feeKey(F.sA1!.id, "60.00"),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const provider = new MockPaymentProvider({ secret: SECRET });
    const status = await provider.getStatus(init.providerReference!);

    const badAmount = {
      id: status.providerEventId,
      type: "payment.completed",
      data: { status: "succeeded", transactionReference: init.providerReference, amountMinor: 6001, currency: "USD" },
    };
    const bodyA = JSON.stringify(badAmount);
    const amountResult = await processProviderWebhook({
      providerName: "mock",
      headers: { "x-mock-signature": hmacSha256Hex(SECRET, bodyA) },
      rawBody: bodyA,
      payload: badAmount,
    });
    expect(amountResult).toMatchObject({ code: 400, status: "FAILED" });

    const badSchool = {
      id: status.providerEventId,
      type: "payment.completed",
      data: {
        status: "succeeded",
        transactionReference: init.providerReference,
        amountMinor: 6000,
        currency: "USD",
        schoolRef: F.schoolB!.id,
      },
    };
    const bodyB = JSON.stringify(badSchool);
    const schoolResult = await processProviderWebhook({
      providerName: "mock",
      headers: { "x-mock-signature": hmacSha256Hex(SECRET, bodyB) },
      rawBody: bodyB,
      payload: badSchool,
    });
    expect(schoolResult).toMatchObject({ code: 403, status: "FAILED" });

    const tx = await db.paymentTransaction.findUnique({ where: { id: init.transactionId } });
    expect(tx!.status).toBe("PENDING");
    expect(await db.webhookEvent.count({ where: { providerEventId: status.providerEventId! } })).toBe(0);
  });

  it("renews an active subscription via a verified payment and keeps an append-only trail", async () => {
    const eventsBefore = await db.subscriptionEvent.count({ where: { subscriptionId: F.subscriptionA!.id } });

    const init = await initiateSubscriptionPayment({
      schoolId: F.schoolA!.id,
      subscriptionId: F.subscriptionA!.id,
      amountMinor: toMinorUnits("0"),
      currency: "USD",
      idempotencyKey: subKey(),
      initiatedById: F.adminA!.id,
    });
    expect(init.ok).toBe(true);
    if (!init.ok) return;

    const verified = await verifyAndApplyPayment(init.transactionId, { verifiedById: F.adminA!.id });
    expect(verified).toMatchObject({ ok: true, status: "SUCCEEDED" });

    const sub = await db.schoolSubscription.findUnique({ where: { id: F.subscriptionA!.id } });
    expect(sub!.status).toBe("ACTIVE");
    expect(sub!.paymentRef).toBe(init.providerReference);
    expect(sub!.providerReference).toBe(init.providerReference);
    expect(sub!.provider).toBe("mock");
    expect(sub!.endDate!.getTime()).toBeGreaterThan(new Date("2027-01-01T00:00:00Z").getTime());

    const eventsAfter = await db.subscriptionEvent.count({ where: { subscriptionId: F.subscriptionA!.id } });
    expect(eventsAfter).toBe(eventsBefore + 1);
    const last = await db.subscriptionEvent.findFirst({
      where: { subscriptionId: F.subscriptionA!.id },
      orderBy: { createdAt: "desc" },
    });
    expect(last!.type).toBe("RENEWED");
    expect(last!.reference).toBe(init.providerReference);
  });
});
