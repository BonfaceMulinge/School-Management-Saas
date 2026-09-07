import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { NewStructureDialog, StructureActions, type StructureFormData } from "./structures-actions";

export const metadata: Metadata = {
  title: "Fee structures",
};

const PAGE_SIZE = 15;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function FeeStructuresPage(
  props: PageProps<"/[school]/finance/structures">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "finance:view", { next: `/${slug}` }),
    canAccess(slug, "finance:manage"),
  ]);

  // Fee structures are a school-billing admin surface with no student rows.
  // Parents/students only ever see their own balance/statement.
  if (
    !access.isPlatformStaff &&
    (access.membership?.role === "PARENT" || access.membership?.role === "STUDENT")
  ) {
    notFound();
  }

  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);
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
      include: {
        streams: { where: { archived: false }, select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const where = {
    schoolId: access.schoolId,
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(termId ? { termId } : {}),
    ...(classId ? { classId } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [total, structures] = await Promise.all([
    db.feeStructure.count({ where }),
    db.feeStructure.findMany({
      where,
      include: {
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        items: {
          where: { archived: false },
          select: { id: true, name: true, amount: true, description: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { charges: true } },
      },
      orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formData: StructureFormData = {
    years: years.map((y) => ({ id: y.id, name: y.name, isActive: y.isActive, terms: y.terms })),
    classes: classes.map((c) => ({ id: c.id, name: c.name, streams: c.streams })),
  };

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
        title="Fees"
        description="Fee structures define what students are billed per year, term, class and stream."
        action={canManage ? <NewStructureDialog slug={slug} formData={formData} /> : undefined}
      />

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
            placeholder="Structure name…"
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
          href={`/${slug}/finance/structures`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {structures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Wallet className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No fee structures found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a structure to start billing fee items for a class.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Structure</th>
                <th className="px-4 py-3 text-left font-medium">Year / Term</th>
                <th className="px-4 py-3 text-left font-medium">Class</th>
                <th className="px-4 py-3 text-center font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-center font-medium">Charged</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {structures.map((s) => {
                const itemTotal = s.items.reduce((a, b) => a + b.amount.toNumber(), 0);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.name}</div>
                      {s.description ? (
                        <div className="max-w-64 truncate text-xs text-muted-foreground">
                          {s.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.academicYear.name}
                      {s.term ? ` · ${s.term.name}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {s.class.name}
                      {s.stream ? ` / ${s.stream.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-center">{s.items.length}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(itemTotal, school.currency)}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {s._count.charges}
                    </td>
                    <td className="px-4 py-3">
                      {s.archived ? (
                        <Badge variant="outline">Archived</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StructureActions
                        slug={slug}
                        structure={{
                          id: s.id,
                          name: s.name,
                          description: s.description,
                          academicYearId: s.academicYearId,
                          termId: s.termId,
                          classId: s.classId,
                          streamId: s.streamId,
                          archived: s.archived,
                          items: s.items.map((i) => ({
                            itemId: i.id,
                            name: i.name,
                            amount: i.amount.toNumber(),
                            description: i.description,
                          })),
                        }}
                        hasCharges={s._count.charges > 0}
                        formData={formData}
                        canManage={canManage}
                      />
                    </td>
                  </tr>
                );
              })}
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
                href={`/${slug}/finance/structures${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/${slug}/finance/structures${queryString({ page: String(page + 1) })}`}
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