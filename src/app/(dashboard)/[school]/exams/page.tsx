import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { examScopeWhere } from "@/server/services/exams";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ExamActions, NewExamDialog } from "./exams-list-actions";
import type { ExamFormData } from "./exams-list-actions";

export const metadata: Metadata = {
  title: "Exams",
};

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  CAT: "CAT",
  MIDTERM: "Midterm",
  END_TERM: "End Term",
  ASSIGNMENT: "Assignment",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ExamsPage(props: PageProps<"/[school]/exams">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "exams:view", { next: `/${slug}` }),
    canAccess(slug, "exams:manage"),
  ]);

  // Exam papers/management are staff-only. Students and parents view results
  // (their own) on the results page, never the exam list.
  if (
    !access.isPlatformStaff &&
    (access.membership?.role === "STUDENT" || access.membership?.role === "PARENT")
  ) {
    notFound();
  }

  const scope = await examScopeWhere(access);

  const type = single(searchParams.type);
  const status = single(searchParams.status);
  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const q = single(searchParams.q);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const where = {
    ...scope,
    schoolId: access.schoolId,
    ...(type ? { type: type as never } : {}),
    ...(status ? { status: status as never } : {}),
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(termId ? { termId } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [years, types, statuses] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.exam.findMany({
      where: { schoolId: access.schoolId },
      distinct: ["type"],
      select: { type: true },
    }),
    db.exam.findMany({
      where: { schoolId: access.schoolId },
      distinct: ["status"],
      select: { status: true },
    }),
  ]);

  const [total, exams] = await Promise.all([
    db.exam.count({ where }),
    db.exam.findMany({
      where,
      include: {
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        subjects: { include: { subject: { select: { id: true, name: true } } } },
        _count: { select: { subjects: true, marks: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Data for the create/edit dialogs (serializable — Decimals converted).
  const formData: ExamFormData = {
    years: years.map((y) => ({ id: y.id, name: y.name, isActive: y.isActive, terms: y.terms })),
    classes: (
      await db.class.findMany({
        where: { schoolId: access.schoolId, archived: false },
        include: {
          streams: { where: { archived: false }, select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      })
    ).map((c) => ({ id: c.id, name: c.name, streams: c.streams })),
    subjects: (
      await db.subject.findMany({
        where: { schoolId: access.schoolId, archived: false },
        orderBy: { name: "asc" },
      })
    ).map((s) => ({ id: s.id, name: s.name, code: s.code })),
  };

  const queryString = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (yearId) params.set("yearId", yearId);
    if (termId) params.set("termId", termId);
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const examTypeSet = new Set(types.map((t) => t.type));
  const examStatusSet = new Set(statuses.map((s) => s.status));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exams"
        description="Create and manage exams, then record subject marks."
        action={canManage ? <NewExamDialog slug={slug} formData={formData} /> : undefined}
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
          Type
          <select
            name="type"
            defaultValue={type ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All types</option>
            {examTypeSet.size > 0
              ? [...examTypeSet].map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t] ?? t}
                  </option>
                ))
              : Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All statuses</option>
            {examStatusSet.size > 0
              ? [...examStatusSet].map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </option>
                ))
              : Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Exam name…"
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
          href={`/${slug}/exams`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No exams found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an exam to start recording subject marks and results.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Exam</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Year / Term</th>
                <th className="px-4 py-3 text-left font-medium">Class</th>
                <th className="px-4 py-3 text-center font-medium">Papers</th>
                <th className="px-4 py-3 text-center font-medium">Marks</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${slug}/exams/${exam.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {exam.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{TYPE_LABELS[exam.type] ?? exam.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(exam.date)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {exam.academicYear.name}
                    {exam.term ? ` · ${exam.term.name}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    {exam.class.name}
                    {exam.stream ? ` / ${exam.stream.name}` : ""}
                  </td>
                  <td className="px-4 py-3 text-center">{exam._count.subjects}</td>
                  <td className="px-4 py-3 text-center">{exam._count.marks}</td>
                  <td className="px-4 py-3">
                    {exam.status === "ARCHIVED" ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : exam.status === "COMPLETED" ? (
                      <Badge variant="secondary">Completed</Badge>
                    ) : (
                      <Badge>{STATUS_LABELS[exam.status] ?? exam.status}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ExamActions
                      slug={slug}
                      exam={{
                        id: exam.id,
                        name: exam.name,
                        type: exam.type,
                        status: exam.status,
                        date: formatDateForInput(exam.date),
                        academicYearId: exam.academicYearId,
                        termId: exam.termId,
                        classId: exam.classId,
                        streamId: exam.streamId,
                        subjects: exam.subjects.map((s) => ({
                          examSubjectId: s.id,
                          subjectId: s.subjectId,
                          subjectName: s.subject.name,
                          maxMarks: s.maxMarks.toNumber(),
                        })),
                      }}
                      formData={formData}
                      canManage={canManage}
                    />
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
            Page {page} of {totalPages} · {total} exam{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={`/${slug}/exams${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </a>
            ) : null}
            {page < totalPages ? (
              <a
                href={`/${slug}/exams${queryString({ page: String(page + 1) })}`}
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
}

function formatDateForInput(date: Date): string {
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${tp(date.getUTCMonth() + 1)}-${tp(date.getUTCDate())}`;
}