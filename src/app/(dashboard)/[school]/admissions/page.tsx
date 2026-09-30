import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";
import { AdmissionsDialog } from "./admissions-dialog";
import type { EnrollmentStatus, Student } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Admissions",
};

const PAGE_SIZE = 20;
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  DROPPED: "Dropped",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AdmissionsPage(
  props: PageProps<"/[school]/admissions">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "enrollments:view", { next: `/${slug}` }),
    canAccess(slug, "enrollments:manage"),
  ]);

  const q = single(searchParams.q);
  const status = single(searchParams.status);
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const activeYear = await db.academicYear.findFirst({
    where: { schoolId: access.schoolId, archived: false },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    include: { terms: { where: { archived: false }, orderBy: { startDate: "asc" } } },
  });

  const [eligibleCount, admissionsTotal, admissions, eligibleStudents] = await Promise.all([
    db.student.count({
      where: {
        schoolId: access.schoolId,
        archived: false,
        status: "ACTIVE" as Student["status"],
        ...(activeYear
          ? { enrollments: { none: { academicYearId: activeYear.id } } }
          : {}),
      },
    }),
    db.enrollment.count({
      where: {
        schoolId: access.schoolId,
        ...(q
          ? {
              student: {
                is: {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" as const } },
                    { middleName: { contains: q, mode: "insensitive" as const } },
                    { lastName: { contains: q, mode: "insensitive" as const } },
                    { studentNo: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            }
          : {}),
        ...(status && STATUS_LABELS[status]
          ? { status: status as EnrollmentStatus }
          : {}),
      },
    }),
    db.enrollment.findMany({
      where: {
        schoolId: access.schoolId,
        ...(q
          ? {
              student: {
                is: {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" as const } },
                    { middleName: { contains: q, mode: "insensitive" as const } },
                    { lastName: { contains: q, mode: "insensitive" as const } },
                    { studentNo: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              },
            }
          : {}),
        ...(status && STATUS_LABELS[status]
          ? { status: status as EnrollmentStatus }
          : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            studentNo: true,
          },
        },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        academicYear: { select: { id: true, name: true } },
        term: { select: { name: true } },
        pathway: { select: { name: true } },
        combination: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.student.findMany({
      where: {
        schoolId: access.schoolId,
        archived: false,
        status: "ACTIVE" as Student["status"],
        ...(activeYear
          ? { enrollments: { none: { academicYearId: activeYear.id } } }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    }),
  ]);

  const [classes, years, pathways, combinations, activeEnrollments] = await Promise.all([
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: [{ level: "asc" }, { name: "asc" }],
      include: { streams: { where: { archived: false }, orderBy: { name: "asc" } } },
    }),
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { startDate: "desc" },
      include: { terms: { where: { archived: false }, orderBy: { startDate: "asc" } } },
    }),
    db.seniorSchoolPathway.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { name: "asc" },
    }),
    db.subjectCombination.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { name: "asc" },
    }),
    db.enrollment.count({
      where: { schoolId: access.schoolId, status: "ACTIVE" as EnrollmentStatus },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(admissionsTotal / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const stats = [
    {
      label: "Admissions this year",
      value: activeYear
        ? admissions.filter((a) => a.academicYear.id === activeYear.id).length
        : 0,
      hint: activeYear ? activeYear.name : "No academic year",
    },
    {
      label: "Students currently active",
      value: activeEnrollments,
      hint: "Active enrollments",
    },
    {
      label: "Eligible for admission",
      value: eligibleCount,
      hint: "Registered, not enrolled this year",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admissions"
        description="Enroll students and review admission records."
        action={
          canManage ? (
            <AdmissionsDialog
              slug={slug}
              students={eligibleStudents.map((s) => ({
                id: s.id,
                firstName: s.firstName,
                middleName: s.middleName,
                lastName: s.lastName,
                studentNo: s.studentNo,
              }))}
              classes={classes.map((c) => ({
                id: c.id,
                name: c.name,
                streams: c.streams.map((st) => ({ id: st.id, name: st.name })),
              }))}
              years={years.map((y) => ({
                id: y.id,
                name: y.name,
                terms: y.terms.map((t) => ({ id: t.id, name: t.name })),
              }))}
              pathways={pathways.map((p) => ({ id: p.id, name: p.name }))}
              combinations={combinations.map((c) => ({
                id: c.id,
                name: c.name,
                code: c.code,
              }))}
              activeYearId={activeYear?.id ?? null}
            />
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by student name or admission number…"
            className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border border-border bg-background px-2 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Search
        </button>
        <a
          href={queryString({ q: "", status: "" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </form>

      {admissionsTotal === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">
            {q || status ? "No admissions match your filters" : "No admissions recorded yet"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || status
              ? "Try adjusting the search or resetting the filters."
              : "Use the Admit student dialog to enroll students for the academic year."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Level & stream</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Pathway / Combination</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Year · Term</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Admitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {admissions.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {enrollment.student.firstName[0]}
                          {enrollment.student.lastName[0]}
                        </span>
                        <div>
                          <p className="font-medium">
                            {fullName(
                              enrollment.student.firstName,
                              enrollment.student.middleName,
                              enrollment.student.lastName
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {enrollment.student.studentNo ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {enrollment.class.name}
                      {enrollment.stream ? ` · ${enrollment.stream.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {enrollment.pathway || enrollment.combination ? (
                        <>
                          {enrollment.pathway ? enrollment.pathway.name : "General"}
                          {enrollment.combination ? (
                            <span className="ml-1 text-xs">· {enrollment.combination.name}</span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {enrollment.academicYear.name}
                      {enrollment.term ? ` · ${enrollment.term.name}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {enrollment.status === "ACTIVE" ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">{STATUS_LABELS[enrollment.status]}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatDate(enrollment.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, admissionsTotal)} of {admissionsTotal} admissions
            </p>
            <div className="flex items-center gap-2">
              <a
                href={queryString({ page: String(safePage - 1) })}
                aria-disabled={safePage <= 1}
                className={safePage <= 1
                  ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50"
                  : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Previous
              </a>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <a
                href={queryString({ page: String(safePage + 1) })}
                aria-disabled={safePage >= totalPages}
                className={safePage >= totalPages
                  ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50"
                  : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Next
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}