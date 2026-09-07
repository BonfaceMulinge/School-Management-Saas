import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptText } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { fullName } from "@/lib/students";
import { AssignChargesForm, AdjustChargeDialog, type ChargeRow } from "./charges-actions";

export const metadata: Metadata = {
  title: "Student charges",
};

const PAGE_SIZE = 20;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function StudentChargesPage(
  props: PageProps<"/[school]/finance/charges">
) {
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
  const classId = single(searchParams.classId);
  const q = single(searchParams.q);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const studentScope = await financeStudentsScopeWhere(access);
  const studentFilter = q
    ? {
        AND: [
          studentScope,
          {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { studentNo: { contains: q, mode: "insensitive" as const } },
            ],
          },
        ],
      }
    : studentScope;

  const filterBase = {
    schoolId: access.schoolId,
    student: studentFilter,
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(termId ? { termId } : {}),
    ...(classId ? { classId } : {}),
  };
  const where = filterBase;

  const [years, classes, structures, agg] = await Promise.all([
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
    db.feeStructure.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: {
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        items: { where: { archived: false }, select: { id: true, name: true, amount: true } },
      },
      orderBy: [{ academicYear: { startDate: "desc" } }, { createdAt: "desc" }],
    }),
    db.studentCharge.aggregate({ _sum: { amount: true }, where }),
  ]);

  const adjustmentAgg = await db.chargeAdjustment.aggregate({
    _sum: { amount: true },
    where: { schoolId: access.schoolId, charge: where },
  });

  const billed = agg._sum.amount?.toNumber() ?? 0;
  const adjusted = adjustmentAgg._sum.amount?.toNumber() ?? 0;

  const requestedStructureId = single(searchParams.structureId);
  const structure =
    structures.find((s) => s.id === requestedStructureId) ?? structures[0] ?? null;

  let roster: {
    student: { id: string; firstName: string; middleName: string | null; lastName: string; studentNo: string | null };
  }[] = [];
  if (structure) {
    roster = await db.enrollment.findMany({
      where: {
        schoolId: access.schoolId,
        classId: structure.classId,
        academicYearId: structure.academicYearId,
        termId: structure.termId,
        status: "ACTIVE",
        ...(structure.streamId ? { streamId: structure.streamId } : {}),
        student: { archived: false },
      },
      select: {
        student: {
          select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
        },
      },
      orderBy: { student: { lastName: "asc" } },
    });
  }

  const [total, charges] = await Promise.all([
    db.studentCharge.count({ where }),
    db.studentCharge.findMany({
      where,
      include: {
        student: {
          select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
        },
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        adjustments: { select: { id: true, type: true, amount: true, reason: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: ChargeRow[] = charges.map((c) => {
    const adjustments = c.adjustments.map((a) => ({
      id: a.id,
      type: a.type,
      amount: a.amount.toNumber(),
      reason: a.reason,
      createdAt: a.createdAt,
    }));
    const net = c.amount.toNumber() - adjustments.reduce((a, b) => a + b.amount, 0);
    return {
      id: c.id,
      studentId: c.studentId,
      studentName: fullName(c.student.firstName, c.student.middleName, c.student.lastName),
      studentNo: c.student.studentNo,
      itemName: c.itemName,
      amount: c.amount.toNumber(),
      net,
      adjustments,
      period: `${c.academicYear.name}${c.term ? ` · ${c.term.name}` : ""}`,
      createdAt: c.createdAt,
    };
  });

  const queryString = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (yearId) params.set("yearId", yearId);
    if (termId) params.set("termId", termId);
    if (classId) params.set("classId", classId);
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Student charges"
        description="Bill fee items to enrolled students, then apply discounts, waivers or adjustments."
      />

      {canManage && structure ? (
        <AssignChargesForm
          slug={slug}
          structures={structures.map((s) => ({
            id: s.id,
            name: s.name,
            label: `${s.academicYear.name} · ${s.term?.name ?? "—"} · ${s.class.name}${s.stream ? ` / ${s.stream.name}` : ""}`,
          }))}
          selectedId={structure.id}
          items={structure.items.map((i) => ({
            id: i.id,
            name: i.name,
            amount: i.amount.toNumber(),
          }))}
          students={roster.map((r) => ({
            id: r.student.id,
            name: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
            studentNo: r.student.studentNo,
          }))}
          structureLabel={`${structure.academicYear.name} · ${structure.term?.name ?? "—"} · ${structure.class.name}${structure.stream ? ` / ${structure.stream.name}` : ""}`}
          filterQuery={queryString({})}
        />
      ) : null}

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Total billed (filtered)</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(billed, school.currency)}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Adjustments (discounts / waivers)</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(adjusted, school.currency)}</p>
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
            defaultValue={termId ?? ""}
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
          Class
          <select
            name="classId"
            defaultValue={classId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Student or admission no…"
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
          href={`/${slug}/finance/charges`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {charges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ReceiptText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No charges found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign fee items to students using the form above to see charges here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-left font-medium">Period</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-center font-medium">Adjustments</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.studentName}</div>
                    <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">{row.itemName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.period}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(row.amount, school.currency)}</td>
                  <td className="px-4 py-3 text-center">
                    {row.adjustments.length > 0 ? (
                      <Badge variant="secondary">{row.adjustments.length}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatMoney(row.net, school.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage ? <AdjustChargeDialog slug={slug} charge={row} /> : null}
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
                href={`/${slug}/finance/charges${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/${slug}/finance/charges${queryString({ page: String(page + 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}