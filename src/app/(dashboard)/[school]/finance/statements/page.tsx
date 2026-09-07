import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, ScrollText } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { buildStudentLedger, toDayStart, toDayEndExclusive } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { fullName } from "@/lib/students";

export const metadata: Metadata = {
  title: "Statements",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function StatementPage(props: PageProps<"/[school]/finance/statements">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "finance:view", { next: `/${slug}` });

  const requestedId = single(searchParams.studentId);
  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);

  const [scopeWhere, years] = await Promise.all([
    financeStudentsScopeWhere(access),
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true, startDate: true, endDate: true } } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const scopeStudents = await db.student.findMany({
    where: scopeWhere,
    select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
    orderBy: { lastName: "asc" },
  });

  const accessible = scopeStudents.map((s) => ({
    id: s.id,
    name: fullName(s.firstName, s.middleName, s.lastName),
    studentNo: s.studentNo,
  }));

  if (accessible.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Statements"
          description="Your student’s fee balance at a glance."
        />
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ScrollText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No students in your view</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Link a student to your account to see statements.
          </p>
        </div>
      </div>
    );
  }

  type AccessibleStudent = { id: string; name: string; studentNo: string | null };
  let student: AccessibleStudent | null = accessible.find((s) => s.id === requestedId) ?? null;
  if (!student) {
    student = accessible.length === 1 ? accessible[0] : null;
  }
  if (!student) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Statements" description="Choose a student to view their statement." />
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-3 text-sm text-muted-foreground">Select a student</p>
          <ul className="space-y-1">
            {accessible.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/${slug}/finance/statements?studentId=${s.id}`}
                  className="block rounded-md border border-border px-4 py-2.5 text-sm hover:bg-muted"
                >
                  {s.name}{s.studentNo ? ` (${s.studentNo})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const activeYear = years.find((y) => y.isActive);
  const defaultYearId = yearId && years.some((y) => y.id === yearId) ? yearId : (activeYear?.id ?? years[0]?.id ?? "");
  const year = years.find((y) => y.id === defaultYearId);

  let effectiveTerm = null;
  if (termId && year) {
    effectiveTerm = year.terms.find((t) => t.id === termId) ?? null;
  }

  const start = effectiveTerm
    ? toDayStart(effectiveTerm.startDate)
    : year
      ? toDayStart(year.startDate)
      : new Date(0);
  const end = effectiveTerm
    ? toDayEndExclusive(effectiveTerm.endDate)
    : year
      ? toDayEndExclusive(year.endDate)
      : toDayEndExclusive(new Date(8640000000000000));

  const [ledger, enrollment] = await Promise.all([
    buildStudentLedger(access.schoolId, student.id, start, end),
    db.enrollment.findFirst({
      where: {
        schoolId: access.schoolId,
        studentId: student.id,
        academicYearId: defaultYearId,
        status: "ACTIVE",
      },
      include: { class: { select: { name: true } }, stream: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const terms = year?.terms ?? [];
  const scopeLabel = effectiveTerm
    ? `${year?.name} · ${effectiveTerm.name}`
    : year?.name ?? "Whole history";

  const rows = ledger.rows.reduce<
    {
      date: Date;
      kind: string;
      amount: number;
      signed: number;
      description: string;
      meta: string | null;
      balance: number;
    }[]
  >((acc, row) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].balance : ledger.opening;
    const signed = row.kind === "CHARGE" || row.kind === "REVERSAL" ? row.amount : -row.amount;
    const balance = Math.round((prev + signed) * 100) / 100;
    return [
      ...acc,
      {
        date: row.date,
        kind: row.kind,
        amount: row.amount,
        signed,
        description: row.description,
        meta: row.meta,
        balance,
      },
    ];
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title="Statements"
          description={`${student.name}${student.studentNo ? ` · ${student.studentNo}` : ""}`}
          action={
            <a
              href={`/${slug}/finance/statements?studentId=${student.id}`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={(e) => {
                e.preventDefault();
                globalThis.print();
              }}
            >
              <Printer className="mr-1 inline size-4" aria-hidden="true" />
              Print
            </a>
          }
        />
      </div>

      <form method="get" className="print:hidden flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex min-w-52 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Student
          <select
            name="studentId"
            defaultValue={student.id}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {accessible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.studentNo ? ` (${s.studentNo})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Academic year
          <select name="yearId" defaultValue={defaultYearId} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
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
            defaultValue={effectiveTerm?.id ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Whole year</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          View
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden print:block border-b border-border px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{school.name}</p>
          <p className="text-lg font-semibold">Fee statement</p>
          <p className="text-sm text-muted-foreground">
            {student.name}
            {student.studentNo ? ` · ${student.studentNo}` : ""} — {scopeLabel}
          </p>
        </div>

        <div className="border-b border-border px-5 py-4 print:hidden flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">
              {student.name}{student.studentNo ? ` (${student.studentNo})` : ""}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{scopeLabel}</span>
              <Badge variant="secondary">
                {enrollment
                  ? `${enrollment.class.name}${enrollment.stream ? ` / ${enrollment.stream.name}` : ""}`
                  : "No active enrollment"}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-2xl font-semibold">{formatMoney(ledger.closing, school.currency)}</p>
          </div>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-4 print:grid-cols-4">
          <div className="bg-card px-5 py-3 print:p-3">
            <p className="text-xs text-muted-foreground">Opening</p>
            <p className="text-lg font-medium">{formatMoney(ledger.opening, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-3 print:p-3">
            <p className="text-xs text-muted-foreground">Billed</p>
            <p className="text-lg font-medium">{formatMoney(ledger.charges, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-3 print:p-3">
            <p className="text-xs text-muted-foreground">Adjusted</p>
            <p className="text-lg font-medium">{formatMoney(ledger.adjustments, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-3 print:p-3">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-medium">{formatMoney(ledger.paid, school.currency)}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">
            No activity in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3 font-medium">Opening balance</td>
                  <td className="px-4 py-3 text-right">{formatMoney(ledger.opening, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(ledger.opening, school.currency)}
                  </td>
                </tr>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.date.valueOf()}-${row.description}`}>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(row.date)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium">
                        {row.kind === "CHARGE"
                          ? "Charge"
                          : row.kind === "ADJUSTMENT"
                            ? "Adjustment"
                            : row.kind === "PAYMENT"
                              ? "Payment"
                              : "Reversal"}
                      </span>
                      <span className="block text-xs text-muted-foreground">{row.description}</span>
                      {row.meta ? <span className="block text-xs text-muted-foreground">{row.meta}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.kind === "PAYMENT" || row.kind === "ADJUSTMENT" ? "text-emerald-600" : ""}>
                        {row.kind === "PAYMENT" || row.kind === "ADJUSTMENT"
                          ? `−${formatMoney(Math.abs(row.signed), school.currency)}`
                          : row.kind === "REVERSAL"
                            ? `+${formatMoney(row.amount, school.currency)}`
                            : formatMoney(row.amount, school.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(row.balance, school.currency)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3 font-semibold">Closing balance</td>
                  <td className="px-4 py-3 text-right">{formatMoney(ledger.closing, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {formatMoney(ledger.closing, school.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="print:hidden text-xs text-muted-foreground">
        A payment made before this period&apos;s start that is reversed after it ends is not shown, so
        the opening balance slightly overstates credit in that edge case.
      </p>
    </div>
  );
}