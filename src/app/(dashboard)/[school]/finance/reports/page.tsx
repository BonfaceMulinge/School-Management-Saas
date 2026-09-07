import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileChartColumn } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { paymentMethodLabel } from "@/lib/finance";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Finance reports",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

const TABS = [
  { value: "collection", label: "Collection" },
  { value: "outstanding", label: "Outstanding" },
  { value: "methods", label: "Payment methods" },
] as const;

export default async function FinanceReportsPage(props: PageProps<"/[school]/finance/reports">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "finance:report", { next: `/${slug}` });

  const view = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as (typeof TABS)[number]["value"])
    : "collection";
  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);

  const [years, classes] = await Promise.all([
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
  ]);

  const scope = {
    schoolId: access.schoolId,
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(termId ? { termId } : {}),
    ...(classId ? { classId } : {}),
  };

  const tabs = (active: string) =>
    TABS.map((t) => {
      const params = new URLSearchParams();
      if (yearId) params.set("yearId", yearId);
      if (termId) params.set("termId", termId);
      if (classId) params.set("classId", classId);
      params.set("view", t.value);
      return { ...t, href: `/${slug}/finance/reports?${params.toString()}`, active: t.value === active };
    });

  const filterBar = (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <input type="hidden" name="view" value={view} />
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
      {view === "outstanding" ? (
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
      ) : null}
      <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Apply
      </button>
      <a
        href={`/${slug}/finance/reports?view=${view}`}
        className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
      >
        Reset
      </a>
    </form>
  );

  let content;

  if (view === "collection") {
    const yearName = new Map(years.map((y) => [y.id, y.name]));
    const byYearTerm = new Map<string, { collected: number; reversed: number; count: number }>();
    for (const y of years) {
      for (const t of y.terms) {
        byYearTerm.set(`${y.id}|${t.id}`, { collected: 0, reversed: 0, count: 0 });
      }
      byYearTerm.set(`${y.id}|`, { collected: 0, reversed: 0, count: 0 });
    }

    const [applied, reversedRows] = await Promise.all([
      db.feePayment.groupBy({
        by: ["academicYearId", "termId"],
        where: { ...scope, status: "APPLIED" },
        _sum: { amount: true },
        _count: { amount: true },
      }),
      db.feePayment.groupBy({
        by: ["academicYearId", "termId"],
        where: { ...scope, status: "REVERSED" },
        _sum: { amount: true },
      }),
    ]);

    for (const g of applied) {
      const key = `${g.academicYearId}|${g.termId ?? ""}`;
      const entry = byYearTerm.get(key) ?? { collected: 0, reversed: 0, count: 0 };
      entry.collected += g._sum.amount?.toNumber() ?? 0;
      entry.count += g._count.amount;
      byYearTerm.set(key, entry);
    }
    for (const g of reversedRows) {
      const key = `${g.academicYearId}|${g.termId ?? ""}`;
      const entry = byYearTerm.get(key) ?? { collected: 0, reversed: 0, count: 0 };
      entry.reversed += g._sum.amount?.toNumber() ?? 0;
      byYearTerm.set(key, entry);
    }

    const rows = [...byYearTerm.entries()]
      .sort((a, b) => {
        const [ay, at] = a[0].split("|");
        const [by, bt] = b[0].split("|");
        if (ay !== by) return (yearName.get(by) ?? "").localeCompare(yearName.get(ay) ?? "");
        return (at ?? "").localeCompare(bt ?? "");
      })
      .map(([key, v]) => {
        const [yId, tId] = key.split("|");
        return {
          year: yearName.get(yId) ?? "—",
          term: tId ? years.find((y) => y.id === yId)?.terms.find((t) => t.id === tId)?.name ?? "—" : "Whole year",
          ...v,
        };
      });

    const totalCollected = rows.reduce((a, r) => a + r.collected, 0);
    const totalReversed = rows.reduce((a, r) => a + r.reversed, 0);

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
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">{r.year}</td>
                  <td className="px-4 py-3">{r.term}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.collected, school.currency)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatMoney(r.reversed, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.collected - r.reversed, school.currency)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
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
    const classKm = new Map(classes.map((c) => [c.id, c]));
    const keyOf = (cId: string, sId: string | null) => `${cId}|${sId ?? ""}`;

    const [billedRows, adjustmentRows, paymentRows, countRows] = await Promise.all([
      db.studentCharge.groupBy({
        by: ["classId", "streamId"],
        where: scope,
        _sum: { amount: true },
      }),
      db.chargeAdjustment.findMany({
        where: { schoolId: access.schoolId, charge: scope },
        include: { charge: { select: { classId: true, streamId: true } } },
      }),
      db.feePayment.groupBy({
        by: ["classId", "streamId"],
        where: { ...scope, status: "APPLIED" },
        _sum: { amount: true },
      }),
      db.enrollment.groupBy({
        by: ["classId", "streamId"],
        where: {
          schoolId: access.schoolId,
          status: "ACTIVE",
          ...(yearId ? { academicYearId: yearId } : {}),
          ...(termId ? { termId } : {}),
          ...(classId ? { classId } : {}),
        },
        _count: { studentId: true },
      }),
    ]);

    const agg = new Map<string, { billed: number; adjusted: number; paid: number; students: number }>();

    for (const g of billedRows) {
      const k = keyOf(g.classId, g.streamId);
      const e = agg.get(k) ?? { billed: 0, adjusted: 0, paid: 0, students: 0 };
      e.billed += g._sum.amount?.toNumber() ?? 0;
      agg.set(k, e);
    }
    for (const a of adjustmentRows) {
      const k = keyOf(a.charge.classId, a.charge.streamId);
      const e = agg.get(k) ?? { billed: 0, adjusted: 0, paid: 0, students: 0 };
      e.adjusted += a.amount.toNumber();
      agg.set(k, e);
    }
    for (const g of paymentRows) {
      const k = keyOf(g.classId, g.streamId);
      const e = agg.get(k) ?? { billed: 0, adjusted: 0, paid: 0, students: 0 };
      e.paid += g._sum.amount?.toNumber() ?? 0;
      agg.set(k, e);
    }
    for (const g of countRows) {
      const guests = agg.get(keyOf(g.classId, g.streamId));
      if (guests) guests.students = g._count.studentId;
    }

    const rows = [...agg.entries()]
      .map(([k, v]) => {
        const [cId, sId] = k.split("|");
        const klass = classKm.get(cId);
        return {
          className: klass?.name ?? "—",
          streamName: sId ? klass?.streams.find((s) => s.id === sId)?.name ?? "—" : "Whole class",
          billed: v.billed,
          adjusted: v.adjusted,
          net: v.billed - v.adjusted,
          paid: v.paid,
          outstanding: v.billed - v.adjusted - v.paid,
          students: v.students,
        };
      })
      .sort((a, b) => a.className.localeCompare(b.className));

    const totals = rows.reduce(
      (acc, r) => ({
        billed: acc.billed + r.billed,
        adjusted: acc.adjusted + r.adjusted,
        paid: acc.paid + r.paid,
        outstanding: acc.outstanding + r.outstanding,
      }),
      { billed: 0, adjusted: 0, paid: 0, outstanding: 0 }
    );

    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Billed</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totals.billed, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Adjusted</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totals.adjusted, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Collected</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totals.paid, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(totals.outstanding, school.currency)}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Class</th>
                <th className="px-4 py-3 text-left font-medium">Stream</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
                <th className="px-4 py-3 text-right font-medium">Billed</th>
                <th className="px-4 py-3 text-right font-medium">Adjusted</th>
                <th className="px-4 py-3 text-right font-medium">Collected</th>
                <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.className}</td>
                  <td className="px-4 py-3">{r.streamName}</td>
                  <td className="px-4 py-3 text-right">{r.students}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.billed, school.currency)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.adjusted, school.currency)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.paid, school.currency)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatMoney(r.outstanding, school.currency)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No charges in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else {
    const [methodGroups, appliedCount] = await Promise.all([
      db.feePayment.groupBy({
        by: ["method"],
        where: { ...scope, status: "APPLIED" },
        _sum: { amount: true },
        _count: { amount: true },
      }),
      db.feePayment.count({ where: { ...scope, status: "APPLIED" } }),
    ]);
    const total = methodGroups.reduce((a, g) => a + (g._sum.amount?.toNumber() ?? 0), 0);
    const rows = methodGroups
      .map((g) => ({
        method: g.method,
        label: paymentMethodLabel(g.method),
        amount: g._sum.amount?.toNumber() ?? 0,
        count: g._count.amount,
        pct: total > 0 ? ((g._sum.amount?.toNumber() ?? 0) / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Total collected</p>
            <p className="mt-1 text-2xl font-semibold">{formatMoney(total, school.currency)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Payments</p>
            <p className="mt-1 text-2xl font-semibold">{appliedCount.toLocaleString()}</p>
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
              {rows.map((r, i) => (
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
              {rows.length === 0 ? (
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance reports"
        description="Collection, outstanding balances and payment-method summaries."
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
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

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <FileChartColumn className="mt-0.5 size-3.5" aria-hidden="true" />
        Outstanding = billed − adjustments − collected, using the class/stream snapshot recorded on
        each charge and payment.
      </p>
    </div>
  );
}