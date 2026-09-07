"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { resolveEnrollmentTarget } from "@/server/services/students";
import { notifyGuardiansOfStudent } from "@/server/services/communication";
import { dayRange } from "@/server/services/attendance";
import {
  MONEY_PATTERN,
  MAX_MONEY,
  findDuplicateFeeStructure,
  resolveEnrollmentSnapshot,
} from "@/server/services/finance";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createAuditLog } from "@/server/services/audit-log";
import { Prisma } from "@/generated/prisma/client";

const methodEnum = z.enum(["CASH", "BANK", "CHEQUE", "OTHER"]);
const adjustmentTypeEnum = z.enum(["DISCOUNT", "WAIVER", "ADJUSTMENT"]);

function indexedEntries(input: FormData, prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of input.entries()) {
    if (!key.startsWith(`${prefix}[`)) continue;
    const id = key.slice(prefix.length + 1, -1);
    if (id) map.set(id, String(value));
  }
  return map;
}

function parseMoney(raw: string): Prisma.Decimal | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const value = new Prisma.Decimal(trimmed);
  if (value.lte(0) || value.gt(MAX_MONEY)) return null;
  return value;
}

function revalidateFinance(slug: string) {
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/finance/structures`);
  revalidatePath(`/${slug}/finance/charges`);
  revalidatePath(`/${slug}/finance/payments`);
  revalidatePath(`/${slug}/finance/statements`);
  revalidatePath(`/${slug}/finance/reports`);
}

function parseStructureBase(input: FormData) {
  return z
    .object({
      name: z.string().trim().min(1, "Name is required.").max(120),
      description: z.string().trim().max(500, "Description is too long.").optional().nullable(),
      academicYearId: z.string().min(1, "Academic year is required."),
      termId: z.string().min(1, "Term is required."),
      classId: z.string().min(1, "Class is required."),
      streamId: z.string().optional().nullable(),
    })
    .safeParse({
      name: input.get("name") ?? "",
      description: input.get("description") ? String(input.get("description")) : null,
      academicYearId: input.get("academicYearId") ?? "",
      termId: input.get("termId") ?? "",
      classId: input.get("classId") ?? "",
      streamId: input.get("streamId") ? String(input.get("streamId")) : null,
    });
}

type ItemRow = { key: string; itemId: string | null; name: string; amount: Prisma.Decimal; description: string | null };

/**
 * Parse `name[<key>]` / `amount[<key>]` / `description[<key>]` rows.
 * Edit-mode rows use `existing-<itemId>` keys so stable ids are preserved.
 */
function parseItemRows(input: FormData): { ok: true; rows: ItemRow[] } | { ok: false; error: string } {
  const nameMap = indexedEntries(input, "name");
  const amountMap = indexedEntries(input, "amount");
  const descMap = indexedEntries(input, "description");
  const rows: ItemRow[] = [];
  const seenNames = new Set<string>();

  for (const [key, rawName] of nameMap) {
    const name = rawName.trim();
    if (!name) continue;
    if (seenNames.has(name.toLowerCase())) {
      return { ok: false, error: "Fee item names must be unique within a structure." };
    }
    seenNames.add(name.toLowerCase());

    const amount = parseMoney(amountMap.get(key) ?? "");
    if (!amount) {
      return { ok: false, error: "Enter each fee item amount as a positive number (up to 2 decimals)." };
    }
    const desc = (descMap.get(key) ?? "").trim();
    if (desc.length > 500) {
      return { ok: false, error: "Fee item descriptions are too long." };
    }

    const itemId = key.startsWith("existing-") ? key.slice("existing-".length) : null;
    rows.push({ key, itemId, name, amount, description: desc || null });
  }

  if (rows.length === 0) {
    return { ok: false, error: "Add at least one fee item." };
  }
  return { ok: true, rows };
}

// ---------------------------------------------------------------------------
// Fee structures
// ---------------------------------------------------------------------------

export async function createFeeStructure(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const parsed = parseStructureBase(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const resolved = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!resolved || !resolved.termId) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  const items = parseItemRows(input);
  if (!items.ok) return fail(items.error);

  if (
    await findDuplicateFeeStructure(
      access.schoolId,
      resolved.academicYearId,
      resolved.termId,
      resolved.classId,
      resolved.streamId
    )
  ) {
    return fail("A fee structure already exists for the same year, term, class and stream.");
  }

  const structure = await db.feeStructure.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      description: data.description,
      academicYearId: resolved.academicYearId,
      termId: resolved.termId,
      classId: resolved.classId,
      streamId: resolved.streamId,
      items: {
        create: items.rows.map((r, i) => ({
          name: r.name,
          amount: r.amount,
          description: r.description,
          sortOrder: i,
        })),
      },
    },
    select: { id: true },
  });

  revalidateFinance(schoolSlug);
  return ok({ id: structure.id });
}

export async function updateFeeStructure(
  schoolSlug: string,
  structureId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const structure = await db.feeStructure.findUnique({
    where: { id: structureId, schoolId: access.schoolId },
    include: {
      items: {
        include: { _count: { select: { charges: true } } },
      },
    },
  });
  if (!structure) return fail("Fee structure not found.");
  if (structure.archived) return fail("Archived fee structures cannot be edited.");

  const parsed = parseStructureBase(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const resolved = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!resolved || !resolved.termId) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  const items = parseItemRows(input);
  if (!items.ok) return fail(items.error);

  const hasCharges = structure.items.some((i) => i._count.charges > 0);
  const targetChanged =
    structure.academicYearId !== resolved.academicYearId ||
    structure.termId !== resolved.termId ||
    structure.classId !== resolved.classId ||
    (structure.streamId ?? null) !== resolved.streamId;
  if (targetChanged && hasCharges) {
    return fail("This structure already has charges, so its year, term, class or stream cannot change.");
  }

  if (targetChanged) {
    if (
      await findDuplicateFeeStructure(
        access.schoolId,
        resolved.academicYearId,
        resolved.termId,
        resolved.classId,
        resolved.streamId,
        structureId
      )
    ) {
      return fail("A fee structure already exists for the same year, term, class and stream.");
    }
  }

  const existingById = new Map(structure.items.map((i) => [i.id, i]));
  const byItemId = new Map<string, ItemRow>();
  const newRows: ItemRow[] = [];
  const finalNames = new Map<string, string>();

  for (const row of items.rows) {
    if (row.itemId && existingById.has(row.itemId)) {
      byItemId.set(row.itemId, row);
      finalNames.set(row.itemId, row.name.toLowerCase());
    } else {
      newRows.push(row);
    }
  }
  const finalNameSet = new Set(finalNames.values());
  for (const n of newRows) {
    if (finalNameSet.has(n.name.toLowerCase())) {
      return fail("Fee item names must be unique within a structure.");
    }
    finalNameSet.add(n.name.toLowerCase());
  }

  const removed = structure.items.filter((i) => !byItemId.has(i.id));
  for (const item of removed) {
    if (item._count.charges > 0) {
      return fail(`"${item.name}" already has charges and cannot be removed. Archive it instead.`);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.feeStructure.update({
      where: { id: structureId },
      data: { name: data.name, description: data.description },
    });

    for (const item of removed) {
      await tx.feeStructureItem.delete({ where: { id: item.id } });
    }

    for (const item of structure.items) {
      const incoming = byItemId.get(item.id);
      if (!incoming) continue;
      const changed =
        incoming.name !== item.name ||
        !incoming.amount.equals(item.amount) ||
        (incoming.description ?? null) !== (item.description ?? null);
      if (changed) {
        await tx.feeStructureItem.update({
          where: { id: item.id },
          data: {
            name: incoming.name,
            amount: incoming.amount,
            description: incoming.description,
          },
        });
      }
    }

    let order = structure.items.length;
    for (const row of newRows) {
      await tx.feeStructureItem.create({
        data: {
          structureId,
          name: row.name,
          amount: row.amount,
          description: row.description,
          sortOrder: order,
        },
      });
      order += 1;
    }
  });

  revalidateFinance(schoolSlug);
  return ok();
}

export async function archiveFeeStructure(
  schoolSlug: string,
  structureId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const structure = await db.feeStructure.findUnique({
    where: { id: structureId, schoolId: access.schoolId },
    select: { id: true, archived: true },
  });
  if (!structure) return fail("Fee structure not found.");
  if (structure.archived) return fail("This fee structure is already archived.");

  await db.feeStructure.update({
    where: { id: structureId },
    data: { archived: true },
  });

  revalidateFinance(schoolSlug);
  return ok();
}

// ---------------------------------------------------------------------------
// Student charges & adjustments
// ---------------------------------------------------------------------------

export async function chargeStudents(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const structureId = String(input.get("structureId") ?? "");
  const structure = await db.feeStructure.findUnique({
    where: { id: structureId, schoolId: access.schoolId },
    include: {
      items: { where: { archived: false }, select: { id: true, name: true, amount: true } },
    },
  });
  if (!structure) return fail("Fee structure not found.");
  if (structure.archived) return fail("Archived fee structures cannot be charged.");

  const itemIds = indexedEntries(input, "item");
  const pendingItems = structure.items.filter((i) => itemIds.has(i.id));
  if (pendingItems.length === 0) {
    return fail("Select at least one fee item to charge.");
  }

  const roster = await db.enrollment.findMany({
    where: {
      schoolId: access.schoolId,
      classId: structure.classId,
      academicYearId: structure.academicYearId,
      termId: structure.termId,
      status: "ACTIVE",
      ...(structure.streamId ? { streamId: structure.streamId } : {}),
      student: { archived: false },
    },
    select: { studentId: true },
  });
  const rosterIds = new Set(roster.map((r) => r.studentId));

  let selectedIds: string[];
  if (String(input.get("allStudents")) === "1") {
    selectedIds = [...rosterIds];
  } else {
    const chosen = indexedEntries(input, "student");
    selectedIds = [...chosen.keys()];
  }
  if (selectedIds.length === 0) {
    return fail("Select at least one student to charge.");
  }
  const students = selectedIds.filter((id) => rosterIds.has(id));
  if (students.length === 0) {
    return fail("None of the selected students are enrolled in this structure's class/stream.");
  }

  const itemIdList = pendingItems.map((i) => i.id);
  const existing = await db.studentCharge.findMany({
    where: {
      schoolId: access.schoolId,
      structureItemId: { in: itemIdList },
      studentId: { in: students },
      academicYearId: structure.academicYearId,
      termId: structure.termId,
    },
    select: { structureItemId: true, studentId: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.structureItemId}|${e.studentId}`));

  let created = 0;
  let skipped = 0;

  await db.$transaction(async (tx) => {
    for (const item of pendingItems) {
      for (const studentId of students) {
        const key = `${item.id}|${studentId}`;
        if (existingKeys.has(key)) {
          skipped += 1;
          continue;
        }
        await tx.studentCharge.create({
          data: {
            schoolId: access.schoolId,
            structureId: structure.id,
            structureItemId: item.id,
            studentId,
            academicYearId: structure.academicYearId,
            termId: structure.termId,
            classId: structure.classId,
            streamId: structure.streamId,
            itemName: item.name,
            amount: item.amount,
            recordedById: access.user.id,
          },
        });
        created += 1;
      }
    }
  });

  revalidateFinance(schoolSlug);
  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "FINANCIAL_ACTION",
    entity: "StudentCharge",
    entityId: structure.id,
    metadata: {
      type: "charge",
      structureName: structure.name,
      structureId: structure.id,
      itemCount: pendingItems.length,
      studentCount: students.length,
      created,
      skipped,
    },
  });
  return ok({ created, skipped });
}

export async function addChargeAdjustment(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const parsed = z
    .object({
      chargeId: z.string().min(1),
      type: adjustmentTypeEnum,
      amount: z.string().min(1, "Enter an amount."),
      reason: z.string().trim().min(3, "A clear reason is required.").max(500),
    })
    .safeParse({
      chargeId: input.get("chargeId") ?? "",
      type: input.get("type") ?? "ADJUSTMENT",
      amount: input.get("amount") ?? "",
      reason: input.get("reason") ?? "",
    });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const amount = parseMoney(parsed.data.amount);
  if (!amount) {
    return fail("Enter a positive amount (up to 2 decimals).");
  }

  const charge = await db.studentCharge.findUnique({
    where: { id: parsed.data.chargeId, schoolId: access.schoolId },
    include: { adjustments: { select: { amount: true } } },
  });
  if (!charge) return fail("Charge not found.");

  const applied = charge.adjustments.reduce((a, b) => a + b.amount.toNumber(), 0);
  const remaining = charge.amount.toNumber() - applied;
  if (amount.gt(new Prisma.Decimal(remaining.toFixed(2)))) {
    return fail(`Adjustments cannot exceed the remaining billed amount (${remaining.toFixed(2)}).`);
  }

  const adjustment = await db.chargeAdjustment.create({
    data: {
      schoolId: access.schoolId,
      chargeId: charge.id,
      studentId: charge.studentId,
      type: parsed.data.type,
      amount,
      reason: parsed.data.reason,
      recordedById: access.user.id,
    },
    select: { id: true, amount: true },
  });

  revalidateFinance(schoolSlug);
  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "FINANCIAL_ACTION",
    entity: "ChargeAdjustment",
    entityId: adjustment.id,
    metadata: {
      type: "adjust",
      chargeId: charge.id,
      studentId: charge.studentId,
      adjustmentType: parsed.data.type,
      amount: adjustment.amount.toFixed(2),
      reason: parsed.data.reason,
    },
  });
  return ok();
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const paymentFormSchema = z
  .object({
    studentId: z.string().min(1, "Student is required."),
    academicYearId: z.string().min(1, "Academic year is required."),
    termId: z.string().optional().nullable(),
    amount: z.string().min(1, "Enter an amount."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
    method: methodEnum,
    otherMethod: z.string().trim().max(80).optional().nullable(),
    referenceNo: z.string().trim().max(80).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
    receiptNo: z.string().trim().max(80).optional().nullable(),
  });

type PaymentFormData = z.infer<typeof paymentFormSchema>;

function parsePaymentForm(input: FormData) {
  return paymentFormSchema.safeParse({
    studentId: input.get("studentId") ?? "",
    academicYearId: input.get("academicYearId") ?? "",
    termId: input.get("termId") ? String(input.get("termId")) : null,
    amount: input.get("amount") ?? "",
    date: input.get("date") ?? "",
    method: input.get("method") ?? "CASH",
    otherMethod: input.get("otherMethod") ? String(input.get("otherMethod")) : null,
    referenceNo: input.get("referenceNo") ? String(input.get("referenceNo")) : null,
    note: input.get("note") ? String(input.get("note")) : null,
    receiptNo: input.get("receiptNo") ? String(input.get("receiptNo")) : null,
  });
}

async function buildPaymentParams(
  access: Awaited<ReturnType<typeof assertPermission>>,
  parsed: PaymentFormData
): Promise<
  | { ok: true; year: { id: string }; termId: string | null; amount: Prisma.Decimal; date: Date; snapshot: { classId: string; streamId: string | null } }
  | { ok: false; error: string }
> {
  const amount = parseMoney(parsed.amount);
  if (!amount) return { ok: false, error: "Enter a positive amount (up to 2 decimals)." };

  const range = dayRange(parsed.date);
  if (!range) return { ok: false, error: "Enter a valid date." };

  const year = await db.academicYear.findUnique({
    where: { id: parsed.academicYearId, schoolId: access.schoolId },
    select: { id: true },
  });
  if (!year) return { ok: false, error: "Academic year is invalid." };

  let termId: string | null = null;
  if (parsed.termId) {
    const term = await db.term.findUnique({
      where: { id: parsed.termId },
      select: { academicYearId: true },
    });
    if (!term || term.academicYearId !== year.id) {
      return { ok: false, error: "The selected term does not belong to this academic year." };
    }
    termId = parsed.termId;
  }

  if (parsed.method === "OTHER" && !parsed.otherMethod) {
    return { ok: false, error: "Describe the payment method when 'Other' is selected." };
  }

  const snapshot = await resolveEnrollmentSnapshot(
    access.schoolId,
    parsed.studentId,
    year.id,
    termId
  );
  if (!snapshot) {
    return { ok: false, error: "This student has no class enrollment to snapshot the payment against." };
  }

  return { ok: true, year, termId, amount, date: range.start, snapshot };
}

function generateReceiptNo(): string {
  return `RCP-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function recordPayment(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const parsed = parsePaymentForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const student = await db.student.findFirst({
    where: { id: parsed.data.studentId, schoolId: access.schoolId, archived: false },
    select: { id: true, firstName: true, middleName: true, lastName: true },
  });
  if (!student) return fail("Student not found.");

  const params = await buildPaymentParams(access, parsed.data);
  if (!params.ok) return fail(params.error);

  const suppliedReceipt = parsed.data.receiptNo?.trim() ?? "";
  let receiptNo = "";
  if (suppliedReceipt) {
    const dup = await db.feePayment.findFirst({
      where: { schoolId: access.schoolId, receiptNo: suppliedReceipt },
      select: { id: true },
    });
    if (dup) return fail("A payment with this receipt/reference number already exists.");
    receiptNo = suppliedReceipt;
  } else {
    receiptNo = generateReceiptNo();
  }

  const created = await db.feePayment.create({
    data: {
      schoolId: access.schoolId,
      studentId: student.id,
      receiptNo,
      amount: params.amount,
      date: params.date,
      method: parsed.data.method,
      otherMethod: parsed.data.method === "OTHER" ? parsed.data.otherMethod : null,
      referenceNo: parsed.data.referenceNo,
      note: parsed.data.note,
      academicYearId: params.year.id,
      termId: params.termId,
      classId: params.snapshot.classId,
      streamId: params.snapshot.streamId,
      recordedById: access.user.id,
    },
    select: { id: true },
  });

  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "FINANCIAL_ACTION",
    entity: "FeePayment",
    entityId: created.id,
    metadata: {
      type: "record",
      studentId: parsed.data.studentId,
      receiptNo,
      amount: params.amount.toFixed(2),
      method: parsed.data.method,
      date: params.date.toISOString().slice(0, 10),
      academicYearId: params.year.id,
      termId: params.termId,
    },
  });

  const studentName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");
  await notifyGuardiansOfStudent(access.schoolId, student.id, {
    type: "FEE_PAYMENT",
    title: "Fee payment received",
    message: `A fee payment (${receiptNo}) was recorded for ${studentName}.`,
    link: `/${schoolSlug}/finance/statements`,
  });

  revalidateFinance(schoolSlug);
  return ok({ id: created.id });
}

export async function correctPayment(
  schoolSlug: string,
  paymentId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const payment = await db.feePayment.findUnique({
    where: { id: paymentId, schoolId: access.schoolId },
  });
  if (!payment) return fail("Payment not found.");
  if (payment.status === "REVERSED") return fail("Reversed payments cannot be corrected.");

  const reason = String(input.get("reason") ?? "").trim();
  if (reason.length < 3) {
    return fail("A clear reason is required for a correction.", { reason: ["A clear reason is required."] });
  }

  const parsed = parsePaymentForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  if (parsed.data.studentId !== payment.studentId) {
    return fail("The student on a payment cannot be changed; reverse it and record a new payment instead.");
  }
  if (parsed.data.academicYearId !== payment.academicYearId) {
    return fail("The academic year on a payment cannot be changed; reverse it and record a new payment instead.");
  }

  const params = await buildPaymentParams(access, parsed.data);
  if (!params.ok) return fail(params.error);

  const newReceipt = parsed.data.receiptNo?.trim() ?? payment.receiptNo;
  if (newReceipt !== payment.receiptNo) {
    const dup = await db.feePayment.findFirst({
      where: { schoolId: access.schoolId, receiptNo: newReceipt, NOT: { id: payment.id } },
      select: { id: true },
    });
    if (dup) return fail("Another payment already uses this receipt/reference number.");
  }

  const hasDateChange = payment.date.getTime() !== params.date.getTime();
  const hasMethodChange = payment.method !== parsed.data.method;

  await db.$transaction(async (tx) => {
    await tx.paymentAdjustment.create({
      data: {
        schoolId: access.schoolId,
        paymentId: payment.id,
        type: "CORRECT",
        oldAmount: payment.amount,
        newAmount: params.amount,
        oldDate: hasDateChange ? payment.date : null,
        newDate: hasDateChange ? params.date : null,
        oldMethod: hasMethodChange ? payment.method : null,
        newMethod: hasMethodChange ? parsed.data.method : null,
        reason,
        recordedById: access.user.id,
      },
    });
    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        amount: params.amount,
        date: params.date,
        method: parsed.data.method,
        otherMethod: parsed.data.method === "OTHER" ? parsed.data.otherMethod : null,
        referenceNo: parsed.data.referenceNo,
        note: parsed.data.note,
        ...(newReceipt !== payment.receiptNo ? { receiptNo: newReceipt } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        schoolId: access.schoolId,
        actorId: access.user.id,
        action: "FINANCIAL_ACTION",
        entity: "FeePayment",
        entityId: payment.id,
        metadata: {
          type: "correct",
          receiptNo: newReceipt,
          oldAmount: payment.amount.toFixed(2),
          newAmount: params.amount.toFixed(2),
          oldDate: payment.date.toISOString().slice(0, 10),
          newDate: params.date.toISOString().slice(0, 10),
          oldMethod: payment.method,
          newMethod: parsed.data.method,
          reason,
        },
      },
    });
  });

  revalidateFinance(schoolSlug);
  return ok();
}

export async function reversePayment(
  schoolSlug: string,
  paymentId: string,
  reason: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "finance:manage");

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) {
    return fail("A clear reason is required for a reversal.");
  }

  const payment = await db.feePayment.findUnique({
    where: { id: paymentId, schoolId: access.schoolId },
  });
  if (!payment) return fail("Payment not found.");
  if (payment.status === "REVERSED") return fail("This payment is already reversed.");

  await db.$transaction(async (tx) => {
    await tx.paymentAdjustment.create({
      data: {
        schoolId: access.schoolId,
        paymentId: payment.id,
        type: "REVERSE",
        oldAmount: payment.amount,
        newAmount: null,
        reason: trimmedReason,
        recordedById: access.user.id,
      },
    });
    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        status: "REVERSED",
        reversedById: access.user.id,
        reversedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        schoolId: access.schoolId,
        actorId: access.user.id,
        action: "FINANCIAL_ACTION",
        entity: "FeePayment",
        entityId: payment.id,
        metadata: {
          type: "reverse",
          receiptNo: payment.receiptNo,
          amount: payment.amount.toFixed(2),
          reason: trimmedReason,
        },
      },
    });
  });

  revalidateFinance(schoolSlug);
  return ok();
}