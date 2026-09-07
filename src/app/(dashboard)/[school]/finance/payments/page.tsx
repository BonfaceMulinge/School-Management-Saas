import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, ReceiptText } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { paymentMethodLabel } from "@/lib/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { fullName } from "@/lib/students";
import {
  RecordPaymentDialog,
  PaymentFormDialog,
  CorrectPaymentDialog,
  ReversePaymentDialog,
  type PaymentRow,
} from "./payments-actions";
import { PrintReceiptButton } from "@/components/finance/print-receipt-button";

export const metadata: Metadata = {
  title: "Payments",
};

const PAGE_SIZE = 20;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function PaymentsPage(props: PageProps<"/[school]/finance/payments">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "finance:view", { next: `/${slug}` }),
    canAccess(slug, "finance:manage"),
  ]);

  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const method = single(searchParams.method);
  const q = single(searchParams.q);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const [years, classes] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  void classes;

  const activeYear = years.find((y) => y.isActive);
  const defaultYearId =
    yearId && years.some((y) => y.id === yearId)
      ? yearId
      : (activeYear?.id ?? years[0]?.id ?? "");

  let effectiveTermId: string | undefined;
  if (termId && years.some((y) => y.terms.some((t) => t.id === termId))) {
    effectiveTermId = termId;
  }

  const studentScope = await financeStudentsScopeWhere(access);

  const where = {
    schoolId: access.schoolId,
    student: studentScope,
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(effectiveTermId ? { termId: effectiveTermId } : {}),
    ...(method ? { method: method as "CASH" | "BANK" | "CHEQUE" | "OTHER" } : {}),
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: "insensitive" as const } },
            {
              student: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { studentNo: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [totals, total, payments] = await Promise.all([
    db.feePayment.groupBy({
      by: ["status"],
      where,
      _sum: { amount: true },
    }),
    db.feePayment.count({ where }),
    db.feePayment.findMany({
      where,
      include: {
        student: {
          select: { firstName: true, middleName: true, lastName: true, studentNo: true },
        },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const collected =
    totals.find((t) => t.status === "APPLIED")?._sum.amount?.toNumber() ?? 0;
  const reversed =
    totals.find((t) => t.status === "REVERSED")?._sum.amount?.toNumber() ?? 0;

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    receiptNo: p.receiptNo,
    studentId: p.studentId,
    academicYearId: p.academicYearId,
    termId: p.termId,
    studentName: fullName(p.student.firstName, p.student.middleName, p.student.lastName),
    studentNo: p.student.studentNo,
    amount: p.amount.toNumber(),
    dateIso: localDateString(p.date),
    method: p.method,
    otherMethod: p.otherMethod,
    referenceNo: p.referenceNo,
    note: p.note,
    status: p.status,
    yearName: p.academicYear.name,
    termName: p.term?.name ?? "Whole year",
    classStream: `${p.class.name}${p.stream ? ` / ${p.stream.name}` : ""}`,
    reversedAt: p.reversedAt ? localDateString(p.reversedAt) : null,
    recordedByName: p.recordedBy.name ?? "—",
  }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const queryString = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (yearId) params.set("yearId", yearId);
    if (effectiveTermId) params.set("termId", effectiveTermId);
    if (method) params.set("method", method);
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  // Record-payment flow: `record` holds a studentId. When present (manage only),
  // the page pre-fills a payment form for that student in the active year.
  const recordStudentId = canManage ? single(searchParams.record) : undefined;
  let recordStudent;
  let recordSerials: { savedName: string; owed: number }[] = [];
  let recordOutstanding = 0;
  let recordYearName = "";
  let terms: { id: string; name: string }[] = [];

  if (recordStudentId) {
    recordStudent = await db.student.findFirst({
      where: { id: recordStudentId, schoolId: access.schoolId, archived: false },
      select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
    });
  }
  if (recordStudent && defaultYearId) {
    const year = years.find((y) => y.id === defaultYearId);
    terms = year?.terms ?? [];
    recordYearName = year?.name ?? "";
    const scopeTermId = effectiveTermId && terms.some((t) => t.id === effectiveTermId)
      ? effectiveTermId
      : null;

    const [charges, applied] = await Promise.all([
      db.studentCharge.findMany({
        where: {
          schoolId: access.schoolId,
          studentId: recordStudent.id,
          academicYearId: defaultYearId,
          ...(scopeTermId ? { termId: scopeTermId } : {}),
        },
        include: { adjustments: { select: { amount: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.feePayment.aggregate({
        _sum: { amount: true },
        where: {
          schoolId: access.schoolId,
          studentId: recordStudent.id,
          academicYearId: defaultYearId,
          ...(scopeTermId ? { termId: scopeTermId } : {}),
          status: "APPLIED",
        },
      }),
    ]);

    recordSerials = charges.map((c) => {
      const adj = c.adjustments.reduce((a, b) => a + b.amount.toNumber(), 0);
      return { savedName: c.itemName, owed: c.amount.toNumber() - adj };
    });
    const billed = charges.reduce((a, c) => {
      const adj = c.adjustments.reduce((x, y) => x + y.amount.toNumber(), 0);
      return a + c.amount.toNumber() - adj;
    }, 0);
    const paid = applied._sum.amount?.toNumber() ?? 0;
    recordOutstanding = billed - paid;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Record fee payments and keep an audited history of corrections and reversals."
        action={
          canManage ? (
            <RecordPaymentDialog
              slug={slug}
              students={
                await db.student
                  .findMany({
                    where: { schoolId: access.schoolId, archived: false },
                    select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
                    orderBy: { lastName: "asc" },
                  })
                  .then((s) =>
                    s.map((it) => ({
                      id: it.id,
                      name: fullName(it.firstName, it.middleName, it.lastName),
                      studentNo: it.studentNo,
                    }))
                  )
              }
              filterQuery={queryString({})}
            />
          ) : undefined
        }
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="bg-card px-5 py-4">
          <div className="flex items-center gap-2">
            <Banknote className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Total collected (filtered)</p>
          </div>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(collected, school.currency)}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Reversed (filtered)</p>
          <p className="mt-1 text-2xl font-semibold text-muted-foreground">
            {formatMoney(reversed, school.currency)}
          </p>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Academic year
          <select
            name="yearId"
            defaultValue={yearId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Term
          <select
            name="termId"
            defaultValue={effectiveTermId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All terms</option>
            {years
              .find((y) => y.id === yearId)
              ?.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Method
          <select
            name="method"
            defaultValue={method ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All methods</option>
            {["CASH", "BANK", "CHEQUE", "OTHER"].map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Receipt no or student…"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        <a
          href={`/${slug}/finance/payments`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {payments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ReceiptText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No payments found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Record a payment to see it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Receipt</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.receiptNo}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.referenceNo ? `Ref ${row.referenceNo}` : row.recordedByName}
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.dateIso}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.studentName}</div>
                    <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-muted-foreground">{row.yearName}</span>
                    <div className="text-xs text-muted-foreground">
                      {row.termName} · {row.classStream}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {paymentMethodLabel(row.method)}
                    {row.otherMethod ? <span className="text-xs text-muted-foreground"> — {row.otherMethod}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(row.amount, school.currency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.status === "APPLIED" ? (
                      <Badge>Applied</Badge>
                    ) : (
                      <Badge variant="destructive">Reversed</Badge>
                    )}
                    {row.reversedAt ? (
                      <div className="mt-1 text-xs text-muted-foreground">{row.reversedAt}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage && row.status === "APPLIED" ? (
                        <>
                          <CorrectPaymentDialog slug={slug} payment={row} />
                          <ReversePaymentDialog slug={slug} payment={row} currency={school.currency} />
                        </>
                      ) : null}
                      {row.status === "APPLIED" ? (
                        <PrintReceiptButton
                          schoolName={school.name}
                          currency={school.currency}
                          receiptNo={row.receiptNo}
                          date={row.dateIso}
                          studentName={row.studentName}
                          studentNo={row.studentNo}
                          amount={row.amount}
                          method={row.method}
                          otherMethod={row.otherMethod}
                          referenceNo={row.referenceNo}
                          yearName={row.yearName}
                          termName={row.termName}
                          classStream={row.classStream}
                          recordedBy={row.recordedByName}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/${slug}/finance/payments${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/${slug}/finance/payments${queryString({ page: String(page + 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {canManage && recordStudent && recordYearName ? (
        <PaymentFormDialog
          slug={slug}
          studentId={recordStudent.id}
          studentLabel={fullName(
            recordStudent.firstName,
            recordStudent.middleName,
            recordStudent.lastName
          )}
          studentNo={recordStudent.studentNo}
          defaultYearId={defaultYearId}
          yearName={recordYearName}
          terms={terms}
          selectedTermId={effectiveTermId && terms.some((t) => t.id === effectiveTermId) ? effectiveTermId : null}
          serials={recordSerials}
          outstanding={recordOutstanding}
          currency={school.currency}
          filterQuery={queryString({})}
        />
      ) : null}
    </div>
  );
}