"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import {
  initiateFeePayment,
  verifyAndApplyPayment,
} from "@/server/integrations/payments/payment-service";
import { makeIdempotencyKey } from "@/lib/integrations";
import { MONEY_PATTERN, MAX_MONEY } from "@/server/services/finance";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { Prisma } from "@/generated/prisma/client";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function revalidateFinance(slug: string) {
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/finance/payments`);
  revalidatePath(`/${slug}/finance/statements`);
  revalidatePath(`/${slug}/payments`);
}

export async function initiateOnlineFeePayment(
  schoolSlug: string,
  input: FormData
): Promise<
  ActionResult<{
    transactionId: string;
    provider: string;
    providerReference: string | null;
    checkoutUrl: string | null;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  }>
> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const parsed = z
    .object({
      studentId: z.string().min(1, "Select a student."),
      amount: z.string().min(1, "Enter an amount."),
    })
    .safeParse({
      studentId: input.get("studentId") ?? "",
      amount: input.get("amount") ?? "",
    });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const amountRaw = parsed.data.amount.trim();
  if (!MONEY_PATTERN.test(amountRaw)) {
    return fail("Enter a valid positive amount (up to 2 decimals).", { amount: ["Enter a valid amount."] });
  }
  const amount = new Prisma.Decimal(amountRaw);
  if (amount.lte(0) || amount.gt(MAX_MONEY)) {
    return fail("Amount must be positive and within the allowed maximum.", { amount: ["Invalid amount."] });
  }

  const student = await db.student.findFirst({
    where: { id: parsed.data.studentId, schoolId: access.schoolId, archived: false },
    select: { id: true },
  });
  if (!student) return fail("Student not found in this school.");

  const school = await db.school.findUnique({
    where: { id: access.schoolId },
    select: { currency: true },
  });

  const idempotencyKey = makeIdempotencyKey([
    access.user.id,
    "fee",
    student.id,
    amountRaw,
    new Date().toISOString().slice(0, 10),
  ]);

  const result = await initiateFeePayment({
    schoolId: access.schoolId,
    studentId: student.id,
    amount,
    currency: school?.currency ?? "USD",
    idempotencyKey,
    initiatedById: access.user.id,
  });

  if (!result.ok) return fail(result.error);
  revalidateFinance(schoolSlug);
  return ok({
    transactionId: result.transactionId,
    provider: result.provider,
    providerReference: result.providerReference,
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  });
}

export async function verifyOnlineFeePayment(
  schoolSlug: string,
  transactionId: string
): Promise<ActionResult<{ status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" }>> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const tx = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, schoolId: true, purpose: true },
  });
  if (!tx || tx.schoolId !== access.schoolId) {
    return fail("Payment not found in this school.");
  }
  if (tx.purpose !== "FEE_PAYMENT") {
    return fail("This transaction is not a fee payment.");
  }

  const result = await verifyAndApplyPayment(transactionId, { verifiedById: access.user.id });
  if (!result.ok) return fail(result.error);

  revalidateFinance(schoolSlug);
  return ok({ status: result.status });
}

export async function listOnlinePayments(schoolSlug: string) {
  const access = await assertPermission(schoolSlug, "finance:view");
  const studentScope = await financeStudentsScopeWhere(access);
  return db.paymentTransaction.findMany({
    where: { schoolId: access.schoolId, student: studentScope },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      student: { select: { firstName: true, lastName: true, studentNo: true } },
    },
  });
}