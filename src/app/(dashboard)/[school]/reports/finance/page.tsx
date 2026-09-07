import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet, Info } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { studentsScopeWhere } from "@/server/services/students";
import {
  feeCollectionReport,
  outstandingReport,
  studentStatementReport,
  paymentHistoryReport,
  paymentMethodSummary,
} from "@/server/services/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CsvExportButton, PrintButton } from "@/components/ui/export-buttons";
import { formatDate, formatMoney } from "@/lib/format";
import { fullName } from "@/lib/students";

export const metadata: Metadata = {
  title: "Finance reports",
};

const TABS = [
  { value: "collection", label: "Fee collection" },
  { value: "outstanding", label: "Outstanding balances" },
  { value: "statements", label: "Student statements" },
  { value: "payments", label: "Payment history" },
  { value: "methods", label: "Payment methods" },
] as const;

type View = (typeof TABS)[number]["value"];

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  return u.toString();
}

export default async function FinanceReportsPage(
  props: PageProps<"/[school]/reports/finance">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "finance:view", { next: `/${slug}` });

  const view: View = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as View)
    : "collection";

  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const from = single(searchParams.from);
  const to = single(searchParams.to);
  const method = single(searchParams.method);
  const studentId = single(searchParams.studentId);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const [years, classes, scopedStudents] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { streams: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    db.student.findMany({
      where: { schoolId: access.schoolId, archived: false, ...(await studentsScopeWhere(access)) },
      select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const tabs = (active: View) =>
    TABS.map((t) => ({
      ...t,
      href: `/${slug}/reports/finance?view=${t.value}`,
      active: t.value === active,
    }));

  const filterBar = (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
      <input type="hidden" name="view" value={view} />
      {view === "collection" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Academic year
            <select name="yearId" defaultValue={yearId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
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
            <select name="termId" defaultValue={termId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
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
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </>
      ) : view === "outstanding" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Academic year
            <select name="yearId" defaultValue={yearId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
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
            <select name="termId" defaultValue={termId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
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
            Class
            <select name="classId" defaultValue={classId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Stream
            <select name="streamId" defaultValue={streamId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All streams</option>
              {classes
                .find((c) => c.id === classId)
                ?.streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
        </>
      ) : view === "statements" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Student
            <select name="studentId" defaultValue={studentId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Choose a student…</option>
              {scopedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s.firstName, s.middleName, s.lastName)} {s.studentNo ? `(${s.studentNo})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </>
      ) : view === "payments" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Method
            <select name="method" defaultValue={method ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All methods</option>
              {["CASH", "BANK", "CHEQUE", "OTHER"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : view === "methods" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </>
      ) : null}
      <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Apply
      </button>
      <a
        href={`/${slug}/reports/finance?view=${view}`}
        className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
      >
        Reset
      </a>
    </form>
  );

  const printHeader = (title: string) => (
    <div className="hidden print:block">
      <h1 className="text-lg font-bold">{school.name}</h1>
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  );

  let content: React.ReactNode;
  let csv: { headers: string[]; rows: string[][] } | null = null;

  if (view === "collection") {
    const report = await feeCollectionReport(access, { yearId, termId, from, to });
    const totalCollected = report.rows.reduce((a, r) => a + r.collected, 0);
    const totalReversed = report.rows.reduce((a, r) => a + r.reversed, 0);
    csv = {
      headers: ["Year", "Term", "Payments", "Collected", "Reversed", "Net"],
      rows: report.rows.map((r) => [r.yearName, r.termName, String(r.count), String(r.collected), String(r.reversed), String(r.net)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Collected (filtered)</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totalCollected, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Reversed</p>
            <p className="mt-1 text-2xl font-semibold text-muted-foreground">{formatMoney(totalReversed, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Net collected</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totalCollected - totalReversed, school.currency)}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Year</th>
                <th className="px-4 py-3 text-left font-medium">Term</th>
                <th className="px-4 py-3 text-right font-medium">Payments</th>
                <th className="px-4 py-3 text-right font-medium">Collected</th>
                <th className="px-4 py-3 text-right font-medium">Reversed</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={`${r.yearName}|${r.termName}`}>
                  <td className="px-4 py-3">{r.yearName}</td>
                  <td className="px-4 py-3">{r.termName}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.collected, school.currency)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatMoney(r.reversed, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.net, school.currency)}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No payment activity in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (view === "outstanding") {
    const report = await outstandingReport(access, { yearId, termId, classId, streamId });
    csv = {
      headers: ["Student", "Admission no.", "Class / Stream", "Billed", "Adjusted", "Collected", "Outstanding"],
      rows: report.rows.map((r) => [
        r.studentName,
        r.studentNo ?? "",
        `${r.className} / ${r.streamName}`,
        String(r.billed),
        String(r.adjusted),
        String(r.paid),
        String(r.outstanding),
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Billed</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(report.billed, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Adjusted</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(report.adjusted, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(report.paid, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(report.outstanding, school.currency)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Showing {report.rows.length} debtor(s) out of {report.debtorCount} student(s) in scope.
        </p>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-right font-medium">Billed</th>
                <th className="px-4 py-3 text-right font-medium">Adjusted</th>
                <th className="px-4 py-3 text-right font-medium">Collected</th>
                <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.studentName}</td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.billed, school.currency)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.adjusted, school.currency)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.paid, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.outstanding, school.currency)}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No outstanding balances in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (view === "statements") {
    const report = studentId
      ? await studentStatementReport(access, { studentId, from, to })
      : { student: null, ledger: null };
    csv = report.ledger
      ? {
          headers: ["Date", "Kind", "Amount", "Description", "Details"],
          rows: report.ledger.rows.map((r) => [
            formatDate(r.date),
            r.kind,
            String(r.amount),
            r.description,
            r.meta ?? "",
          ]),
        }
      : null;
    content = report.student && report.ledger ? (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Opening balance</p>
            <p className="mt-1 text-sm font-medium">{formatMoney(report.ledger.opening, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Charges</p>
            <p className="mt-1 text-sm font-medium">{formatMoney(report.ledger.charges, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Adjustments</p>
            <p className="mt-1 text-sm font-medium">{formatMoney(report.ledger.adjustments, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Closing balance</p>
            <p className="mt-1 text-sm font-medium">{formatMoney(report.ledger.closing, school.currency)}</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.ledger.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">{r.kind}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.amount, school.currency)}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3">{r.meta ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Wallet className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-medium">Choose a student</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a student above to generate their fee statement.
        </p>
      </div>
    );
  } else if (view === "payments") {
    const report = await paymentHistoryReport(access, { from, to, method, page, take: 50 });
    csv = {
      headers: ["Receipt no.", "Student", "Admission no.", "Date", "Amount", "Method", "Reference", "Class / Stream"],
      rows: report.rows.map((r) => [
        r.receiptNo,
        r.studentName,
        r.studentNo ?? "",
        formatDate(r.date),
        String(r.amount),
        r.method,
        r.referenceNo ?? "",
        `${r.className} / ${r.streamName}`,
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Receipt no.</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-left font-medium">Reference</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.receiptNo}</td>
                  <td className="px-4 py-3">{r.studentName}</td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.amount, school.currency)}</td>
                  <td className="px-4 py-3">{r.method}</td>
                  <td className="px-4 py-3">{r.referenceNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No payments in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {report.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {report.page} of {report.totalPages} · {report.total} payment(s)
            </span>
            <div className="flex items-center gap-2">
              {report.page > 1 ? (
                <a
                  href={`/${slug}/reports/finance?${qs({ view, from, to, method, page: String(report.page - 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Previous
                </a>
              ) : null}
              {report.page < report.totalPages ? (
                <a
                  href={`/${slug}/reports/finance?${qs({ view, from, to, method, page: String(report.page + 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Next
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  } else {
    const report = await paymentMethodSummary(access, { from, to });
    const total = report.rows.reduce((a: number, r) => a + r.amount, 0);
    csv = {
      headers: ["Method", "Payments", "Amount", "Share %"],
      rows: report.rows.map((r) => [r.label, String(r.count), String(r.amount), String(r.pct.toFixed(1))]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Total collected</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(total, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Payments</p>
            <p className="mt-1 text-2xl font-semibold">{report.rows.reduce((a: number, r) => a + r.count, 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Method</th>
                <th className="px-4 py-3 text-right font-medium">Payments</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 w-1/3 font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">{r.label}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.amount, school.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.max(2, r.pct))}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {r.pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No collected payments in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const reportTitle =
    view === "collection"
      ? "Fee collection summary"
      : view === "outstanding"
        ? "Outstanding balances"
        : view === "statements"
          ? "Student fee statement"
          : view === "payments"
            ? "Payment history"
            : "Payment method summary";

  return (
    <div className="flex flex-col gap-6">
      {printHeader(reportTitle)}
      <div className="print:hidden">
        <PageHeader
          title="Finance reports"
          description="Collection, outstanding, statements, payments and method summaries."
          action={
            <div className="flex items-center gap-2">
              <PrintButton />
              {csv ? (
                <CsvExportButton
                  filename={`finance-${view}.csv`}
                  headers={csv.headers}
                  rows={csv.rows}
                />
              ) : null}
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 print:hidden">
        {tabs(view).map((t) => (
          <Link
            key={t.value}
            href={t.href}
            className={
              t.active
                ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filterBar}
      {content}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
        <Info className="mt-0.5 size-3.5" aria-hidden="true" />
        Outstanding = billed − adjustments − collected, using the class/stream snapshot recorded
        on each charge and payment. Student statements cover the full ledger or a date window.
      </p>
    </div>
  );
}