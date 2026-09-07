import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import { Prisma } from "@/generated/prisma/client";
import {
  studentsScopeWhere,
} from "@/server/services/students";
import {
  paymentMethodLabel,
  adjustmentTypeLabel,
  paymentStatusLabel,
} from "@/lib/finance";

export { paymentMethodLabel, adjustmentTypeLabel, paymentStatusLabel };

// Re-exported from the pure module so existing imports keep working.
export {
  MONEY_PATTERN,
  MAX_MONEY,
  roundMoney,
  toDayStart,
  toDayEndExclusive,
} from "@/lib/money";
import { roundMoney } from "@/lib/money";

/**
 * Server-side helpers for the finance module (Phase 7). Money is always
 * handled as Prisma.Decimal(12,2) and converted to plain numbers only for
 * display via `Math.round(x * 100) / 100`.
 */

/**
 * Student visibility scope for financial data. Delegates to the student
 * module so parents only see linked children, students only themselves and
 * teachers only their assigned classes — the exact same boundary used by the
 * attendance/exam modules.
 */
export async function financeStudentsScopeWhere(
  access: SchoolAccess
): Promise<Prisma.StudentWhereInput> {
  return studentsScopeWhere(access);
}

export type StudentPick = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  studentNo: string | null;
};

/**
 * Validate there is not already a fee structure for the same
 * (school, year, term, class, stream) — the DB unique index cannot catch
 * stream-wide (streamId NULL) duplicates because Postgres treats NULLs as
 * distinct.
 */
export async function findDuplicateFeeStructure(
  schoolId: string,
  academicYearId: string,
  termId: string,
  classId: string,
  streamId: string | null,
  excludeId?: string
): Promise<boolean> {
  const found = await db.feeStructure.findFirst({
    where: {
      schoolId,
      academicYearId,
      termId,
      classId,
      streamId: streamId ?? null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

/**
 * Resolve the class/stream a student was enrolled in for a given year/term so
 * charges and payments can snapshot the correct class. Prefers the exact
 * (year, term) enrollment, then any enrollment for the year, then the most
 * recent enrollment for any period.
 */
export async function resolveEnrollmentSnapshot(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  termId: string | null
): Promise<{ classId: string; streamId: string | null } | null> {
  const scope: Prisma.EnrollmentWhereInput = {
    schoolId,
    studentId,
    status: "ACTIVE",
    student: { archived: false },
  };

  const termMatch =
    termId !== null
      ? await db.enrollment.findFirst({
          where: { ...scope, academicYearId, termId },
          select: { classId: true, streamId: true },
          orderBy: { enrolledAt: "desc" },
        })
      : null;
  if (termMatch) return termMatch;

  const yearMatch = await db.enrollment.findFirst({
    where: { ...scope, academicYearId },
    select: { classId: true, streamId: true },
    orderBy: { enrolledAt: "desc" },
  });
  if (yearMatch) return yearMatch;

  const anyMatch = await db.enrollment.findFirst({
    where: scope,
    select: { classId: true, streamId: true },
    orderBy: { enrolledAt: "desc" },
  });
  if (anyMatch) return anyMatch;

  return null;
}

export type LedgerRow = {
  id: string;
  kind: "CHARGE" | "ADJUSTMENT" | "PAYMENT" | "REVERSAL";
  date: Date;
  amount: number; // signed; adjustments are positive (reductions)
  description: string;
  meta: string | null;
};

export type StudentLedger = {
  opening: number;
  charges: number;
  adjustments: number;
  paid: number;
  closing: number;
  rows: LedgerRow[];
};

const ROW_ORDER: Record<LedgerRow["kind"], number> = {
  CHARGE: 2,
  ADJUSTMENT: 3,
  PAYMENT: 1,
  REVERSAL: 4,
};

/**
 * Build a student ledger for an inclusive date window [start, end).
 * Charges are attributed to their term start date; payments to their recorded
 * day (@db.Date). Opening = outstanding before the window; closing = opening +
 * charges − adjustments − paid. Rows are bounded to the window. Reversed
 * payments inside the window are shown as informational rows and excluded from
 * `paid` (their loss is already reflected by excluding the payment itself).
 */
export async function buildStudentLedger(
  schoolId: string,
  studentId: string,
  start: Date,
  end: Date
): Promise<StudentLedger> {
  const [charges, payments] = await Promise.all([
    db.studentCharge.findMany({
      where: { schoolId, studentId },
      include: {
        term: { select: { startDate: true, name: true } },
        academicYear: { select: { name: true } },
        adjustments: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.feePayment.findMany({
      where: { schoolId, studentId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  let opening = 0;
  let chargesTotal = 0;
  let adjustmentsTotal = 0;
  let paidTotal = 0;
  const rows: LedgerRow[] = [];

  for (const c of charges) {
    const d = c.term?.startDate ?? c.createdAt;
    const adjTotal = c.adjustments.reduce((a, b) => a + b.amount.toNumber(), 0);
    if (d < start) {
      opening += c.amount.toNumber() - adjTotal;
    } else if (d < end) {
      chargesTotal += c.amount.toNumber();
      adjustmentsTotal += adjTotal;
      rows.push({
        id: c.id,
        kind: "CHARGE",
        date: d,
        amount: c.amount.toNumber(),
        description: c.itemName,
        meta: `${c.academicYear.name}${c.term ? ` · ${c.term.name}` : ""}`,
      });
      for (const a of c.adjustments) {
        rows.push({
          id: a.id,
          kind: "ADJUSTMENT",
          date: a.createdAt,
          amount: a.amount.toNumber(),
          description: `${adjustmentTypeLabel(a.type)} — ${a.reason}`,
          meta: null,
        });
      }
    }
  }

  for (const p of payments) {
    const amt = p.amount.toNumber();
    if (p.status === "APPLIED") {
      if (p.date < start) {
        opening -= amt;
      } else if (p.date < end) {
        paidTotal += amt;
        rows.push({
          id: p.id,
          kind: "PAYMENT",
          date: p.date,
          amount: amt,
          description: `Receipt ${p.receiptNo}`,
          meta: [
            paymentMethodLabel(p.method),
            p.otherMethod ?? null,
            p.referenceNo ? `Ref ${p.referenceNo}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        });
      }
    } else if (p.date >= start && p.date < end) {
      rows.push({
        id: p.id,
        kind: "REVERSAL",
        date: p.reversedAt ?? p.date,
        amount: -amt,
        description: `Reversal of receipt ${p.receiptNo}`,
        meta: null,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() || ROW_ORDER[a.kind] - ROW_ORDER[b.kind]
  );

  return {
    opening: roundMoney(opening),
    charges: roundMoney(chargesTotal),
    adjustments: roundMoney(adjustmentsTotal),
    paid: roundMoney(paidTotal),
    closing: roundMoney(opening + chargesTotal - adjustmentsTotal - paidTotal),
    rows: rows.map((r) => ({ ...r, amount: roundMoney(r.amount) })),
  };
}