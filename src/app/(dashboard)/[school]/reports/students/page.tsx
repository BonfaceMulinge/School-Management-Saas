import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, Info } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  studentListReport,
  enrollmentReport,
  classStreamDistribution,
  genderDistribution,
  studentStatusDistribution,
} from "@/server/services/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CsvExportButton, PrintButton } from "@/components/ui/export-buttons";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Student reports",
};

const TABS = [
  { value: "list", label: "Student list" },
  { value: "enrollment", label: "Enrollment" },
  { value: "class-stream", label: "Class / stream sizes" },
  { value: "gender", label: "Gender distribution" },
  { value: "status", label: "Student status" },
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

const PAGE_SIZE = 50;

export default async function StudentReportsPage(
  props: PageProps<"/[school]/reports/students">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "students:view", { next: `/${slug}` });

  const view: View = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as View)
    : "list";

  const q = single(searchParams.q);
  const yearId = single(searchParams.yearId);
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const gender = single(searchParams.gender);
  const status = single(searchParams.status);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const [years, classes] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { startDate: "desc" },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { streams: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const tabs = (active: View) =>
    TABS.map((t) => ({
      ...t,
      href: `/${slug}/reports/students?view=${t.value}`,
      active: t.value === active,
    }));

  const ties = (opts: Array<{ label: string; value: string }>) =>
    opts.map((o) => ({ label: o.label, value: o.value }));

  function filterBar() {
    return (
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="yearId" value={yearId ?? ""} />
        <input type="hidden" name="classId" value={classId ?? ""} />
        <label className="flex min-w-56 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name or admission number…"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
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
        {view === "list" ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Gender
              <select name="gender" defaultValue={gender ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="">All genders</option>
                {ties([{ label: "Male", value: "MALE" }, { label: "Female", value: "FEMALE" }, { label: "Other", value: "OTHER" }]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Status
              <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="">All statuses</option>
                {ties([{ label: "Active", value: "ACTIVE" }, { label: "Suspended", value: "SUSPENDED" }, { label: "Withdrawn", value: "WITHDRAWN" }]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : view === "enrollment" ? (
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
            <input type="hidden" name="status" value={status ?? ""} />
          </>
        ) : view === "class-stream" ? (
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
        ) : null}
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Apply
        </button>
        <a
          href={`/${slug}/reports/students?view=${view}`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>
    );
  }

  const printHeader = (title: string) => (
    <div className="hidden print:block">
      <h1 className="text-lg font-bold">{school.name}</h1>
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  );

  let content: React.ReactNode;
  let csv: { headers: string[]; rows: string[][] } | null = null;

  if (view === "list") {
    const report = await studentListReport(access, {
      q,
      gender,
      status,
      classId,
      streamId,
      page,
      take: PAGE_SIZE,
    });
    csv = {
      headers: ["Name", "Admission no.", "Gender", "Status", "Class", "Stream", "Date of birth"],
      rows: report.rows.map((r) => [
        String(r.name),
        String(r.studentNo ?? ""),
        String(r.gender),
        String(r.status),
        String(r.className),
        String(r.streamName),
        String(r.dateOfBirth ? formatDate(r.dateOfBirth) : ""),
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Gender</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-left font-medium">Date of birth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${slug}/students/${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">{r.gender}</td>
                  <td className="px-4 py-3">{r.status}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3">{r.dateOfBirth ? formatDate(r.dateOfBirth) : "—"}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No students matched the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {report.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {report.page} of {report.totalPages} · {report.total} students
            </span>
            <div className="flex items-center gap-2">
              {report.page > 1 ? (
                <a
                  href={`/${slug}/reports/students?${qs({ view, q, gender, status, classId, streamId, page: String(report.page - 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Previous
                </a>
              ) : null}
              {report.page < report.totalPages ? (
                <a
                  href={`/${slug}/reports/students?${qs({ view, q, gender, status, classId, streamId, page: String(report.page + 1) })}`}
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
  } else if (view === "enrollment") {
    const report = await enrollmentReport(access, { yearId, classId, streamId, status, page, take: PAGE_SIZE });
    csv = {
      headers: ["Student", "Admission no.", "Year", "Term", "Class", "Stream", "Enrollment status", "Enrolled on"],
      rows: report.rows.map((r) => [
        String(r.studentName),
        String(r.studentNo ?? ""),
        String(r.yearName),
        String(r.termName),
        String(r.className),
        String(r.streamName),
        String(r.enrollmentStatus),
        String(formatDate(r.enrolledAt)),
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Year</th>
                <th className="px-4 py-3 text-left font-medium">Term</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Enrolled on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/${slug}/students/${r.studentId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">{r.yearName}</td>
                  <td className="px-4 py-3">{r.termName}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3">{r.enrollmentStatus}</td>
                  <td className="px-4 py-3">{formatDate(r.enrolledAt)}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No enrollments matched the filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {report.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {report.page} of {report.totalPages} · {report.total} enrollments
            </span>
            <div className="flex items-center gap-2">
              {report.page > 1 ? (
                <a
                  href={`/${slug}/reports/students?${qs({ view, yearId, classId, streamId, status, page: String(report.page - 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Previous
                </a>
              ) : null}
              {report.page < report.totalPages ? (
                <a
                  href={`/${slug}/reports/students?${qs({ view, yearId, classId, streamId, status, page: String(report.page + 1) })}`}
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
  } else if (view === "class-stream") {
    const report = await classStreamDistribution(access, { yearId });
    csv = {
      headers: ["Class", "Stream", "Students"],
      rows: report.rows.map((r) => [r.className, r.streamName, String(r.students)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Active enrolments</p>
            <p className="mt-1 text-2xl font-semibold">{report.total.toLocaleString()}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Classes / streams</p>
            <p className="mt-1 text-2xl font-semibold">{report.rows.length}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Average per class/stream</p>
            <p className="mt-1 text-2xl font-semibold">
              {report.rows.length > 0 ? Math.round(report.total / report.rows.length) : 0}
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Class</th>
                <th className="px-4 py-3 text-left font-medium">Stream</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.className}</td>
                  <td className="px-4 py-3">{r.streamName}</td>
                  <td className="px-4 py-3 text-right">{r.students}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No active enrolments in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (view === "gender") {
    const report = await genderDistribution(access);
    csv = {
      headers: ["Gender", "Students"],
      rows: report.rows.map((r) => [String(r.gender), String(r.count)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {report.rows.map((r, i) => (
            <div key={i} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{r.gender}</p>
              <p className="mt-1 text-2xl font-semibold">{r.count}</p>
            </div>
          ))}
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold">{report.total}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Gender</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
                <th className="px-4 py-3 w-1/3 font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.gender}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${report.total > 0 ? Math.min(100, Math.max(2, (r.count / report.total) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {report.total > 0 ? Math.round((r.count / report.total) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No students in your scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else {
    const report = await studentStatusDistribution(access);
    csv = {
      headers: ["Status", "Students"],
      rows: report.rows.map((r) => [r.status, String(r.count)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
                <th className="px-4 py-3 w-1/3 font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.status}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${report.total > 0 ? Math.min(100, Math.max(2, (r.count / report.total) * 100)) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {report.total > 0 ? Math.round((r.count / report.total) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    No students in your scope.
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
    view === "list"
      ? "Student list"
      : view === "enrollment"
        ? "Enrollment report"
        : view === "class-stream"
          ? "Class / stream distribution"
          : view === "gender"
            ? "Gender distribution"
            : "Student status";

  return (
    <div className="flex flex-col gap-6">
      {printHeader(reportTitle)}
      <div className="print:hidden">
        <PageHeader
          title="Student reports"
          description="Roster, enrollment, class/stream, gender and status breakdowns."
          action={
            <div className="flex items-center gap-2">
              <PrintButton />
              {csv ? (
                <CsvExportButton
                  filename={`students-${view}.csv`}
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

      {filterBar()}
      {content}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
        <Users className="mt-0.5 size-3.5" aria-hidden="true" />
        <Info className="mt-0.5 size-3.5" aria-hidden="true" />
        Student scoping applies: parents see only linked children, students only their own record and
        teachers only their assigned classes.
      </p>
    </div>
  );
}