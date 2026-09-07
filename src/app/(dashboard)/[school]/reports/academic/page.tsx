import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GraduationCap, Info } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { studentsScopeWhere } from "@/server/services/students";
import { examScopeWhere } from "@/server/services/exams";
import {
  examResultsReport,
  classPerformanceReport,
  subjectPerformanceReport,
  studentAcademicHistory,
  gradeDistribution,
} from "@/server/services/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CsvExportButton, PrintButton } from "@/components/ui/export-buttons";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";

export const metadata: Metadata = {
  title: "Academic reports",
};

const TABS = [
  { value: "exam-results", label: "Exam results" },
  { value: "class-performance", label: "Class performance" },
  { value: "subject-performance", label: "Subject performance" },
  { value: "history", label: "Student history" },
  { value: "grade-distribution", label: "Grade distribution" },
] as const;

type View = (typeof TABS)[number]["value"];

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AcademicReportsPage(
  props: PageProps<"/[school]/reports/academic">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "results:view", { next: `/${slug}` });

  const view: View = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as View)
    : "exam-results";

  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);
  const examId = single(searchParams.examId);
  const subjectId = single(searchParams.subjectId);
  const studentId = single(searchParams.studentId);

  const examScope = await examScopeWhere(access);

  const [years, classes, exams, subjects, scopedStudents] = await Promise.all([
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
    db.exam.findMany({
      where: {
        schoolId: access.schoolId,
        status: { not: "ARCHIVED" },
        ...examScope,
        ...(yearId ? { academicYearId: yearId } : {}),
        ...(termId ? { termId } : {}),
        ...(classId ? { classId } : {}),
      },
      select: {
        id: true,
        name: true,
        date: true,
        class: { select: { name: true } },
        stream: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.subject.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { name: "asc" },
    }),
    db.student.findMany({
      where: { schoolId: access.schoolId, archived: false, ...(await studentsScopeWhere(access)) },
      select: { id: true, firstName: true, middleName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const tabs = (active: View) =>
    TABS.map((t) => ({
      ...t,
      href: `/${slug}/reports/academic?view=${t.value}`,
      active: t.value === active,
    }));

  const filterBar = (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
      <input type="hidden" name="view" value={view} />
      {view !== "history" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Exam
            <select name="examId" defaultValue={examId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Latest exams first</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.academicYear.name} · {e.class.name}
                </option>
              ))}
            </select>
          </label>
          {view === "class-performance" ? (
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
            </>
          ) : view === "subject-performance" ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Subject
              <select name="subjectId" defaultValue={subjectId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Student
            <select name="studentId" defaultValue={studentId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Choose a student…</option>
              {scopedStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s.firstName, s.middleName, s.lastName)}
                </option>
              ))}
            </select>
          </label>
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
        </>
      )}
      <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Apply
      </button>
      <a
        href={`/${slug}/reports/academic?view=${view}`}
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

  if (view === "exam-results") {
    const report = await examResultsReport(access, { examId, yearId, termId, classId });
    const exam = report.exam;
    if (exam) {
      csv = {
        headers: ["Rank", "Student", "Admission no.", "Grade", "Points", "Percentage"],
        rows: report.rows.map((r) => [
          String(r.rank ?? ""),
          r.studentName,
          r.studentNo ?? "",
          r.grade,
          String(r.points ?? ""),
          String(r.percentage ?? ""),
        ]),
      };
    }
    content = exam ? (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Exam</p>
            <p className="mt-1 text-sm font-medium">{exam.name}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Class / Stream</p>
            <p className="mt-1 text-sm font-medium">
              {exam.className}
              {exam.streamName !== "—" ? ` / ${exam.streamName}` : ""}
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Year / Term</p>
            <p className="mt-1 text-sm font-medium">
              {exam.yearName} · {exam.termName} · {formatDate(exam.date)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-right font-medium">Percentage</th>
                <th className="px-4 py-3 text-left font-medium">Grade</th>
                <th className="px-4 py-3 text-left font-medium">Points</th>
                <th className="px-4 py-3 text-left font-medium">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="px-4 py-3">{r.rank ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.studentName}</td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{r.percentage ?? "—"}</td>
                  <td className="px-4 py-3">{r.grade}</td>
                  <td className="px-4 py-3">{r.points ?? "—"}</td>
                  <td className="px-4 py-3">{r.remark}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No results recorded for this exam yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <GraduationCap className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-medium">No exams in scope</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an exam or adjust the year/term/class filters.
        </p>
      </div>
    );
  } else if (view === "class-performance") {
    const report = await classPerformanceReport(access, { yearId, termId, classId });
    csv = {
      headers: ["Exam", "Date", "Year", "Term", "Class", "Stream", "Sat", "Average %"],
      rows: report.rows.map((r) => [r.examName, formatDate(r.date), r.yearName, r.termName, r.className, r.streamName, String(r.sat), String(r.average ?? "")]),
    };
    content = (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Exam</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Year / Term</th>
              <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
              <th className="px-4 py-3 text-right font-medium">Sat</th>
              <th className="px-4 py-3 text-right font-medium">Average %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {report.rows.map((r) => (
              <tr key={r.examId}>
                <td className="px-4 py-3 font-medium">{r.examName}</td>
                <td className="px-4 py-3">{formatDate(r.date)}</td>
                <td className="px-4 py-3">
                  {r.yearName} · {r.termName}
                </td>
                <td className="px-4 py-3">
                  {r.className}
                  {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                </td>
                <td className="px-4 py-3 text-right">{r.sat}</td>
                <td className="px-4 py-3 text-right font-medium">{r.average ?? "—"}</td>
              </tr>
            ))}
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No exams in the selected scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  } else if (view === "subject-performance") {
    const report = await subjectPerformanceReport(access, { examId, subjectId });
    csv = {
      headers: ["Exam", "Year / Term", "Subject", "Max marks", "Sat", "Average %"],
      rows: report.rows.map((r) => [r.examName, `${r.yearName} · ${r.termName}`, r.subjectName, String(r.maxMarks), String(r.sat), String(r.average ?? "")]),
    };
    content = (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Exam</th>
              <th className="px-4 py-3 text-left font-medium">Year / Term</th>
              <th className="px-4 py-3 text-left font-medium">Subject</th>
              <th className="px-4 py-3 text-right font-medium">Max marks</th>
              <th className="px-4 py-3 text-right font-medium">Sat</th>
              <th className="px-4 py-3 text-right font-medium">Average %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {report.rows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-3 font-medium">{r.examName}</td>
                <td className="px-4 py-3">
                  {r.yearName} · {r.termName}
                </td>
                <td className="px-4 py-3">{r.subjectName}</td>
                <td className="px-4 py-3 text-right">{r.maxMarks}</td>
                <td className="px-4 py-3 text-right">{r.sat}</td>
                <td className="px-4 py-3 text-right font-medium">{r.average ?? "—"}</td>
              </tr>
            ))}
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No marks in the selected scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    );
  } else if (view === "history") {
    const report = studentId
      ? await studentAcademicHistory(access, { studentId, yearId })
      : { rows: [] };
    const student = scopedStudents.find((s) => s.id === studentId);
    csv = {
      headers: ["Exam", "Date", "Year / Term", "Percentage"],
      rows: report.rows.map((r) => [r.examName, formatDate(r.date), `${r.yearName} · ${r.termName}`, String(r.percentage ?? "")]),
    };
    content = student ? (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Exams sat</p>
            <p className="mt-1 text-2xl font-semibold">{report.rows.length}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Best</p>
            <p className="mt-1 text-2xl font-semibold">
              {report.rows.length > 0
                ? Math.max(...report.rows.map((r) => r.percentage ?? 0))
                : "—"}
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Recent</p>
            <p className="mt-1 text-2xl font-semibold">
              {report.rows[0]?.percentage ?? "—"}
            </p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Mean</p>
            <p className="mt-1 text-2xl font-semibold">
              {report.rows.length > 0
                ? Math.round(
                    (report.rows.reduce((a, r) => a + (r.percentage ?? 0), 0) / report.rows.length) * 10
                  ) / 10
                : "—"}
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Exam</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Year / Term</th>
                <th className="px-4 py-3 text-right font-medium">Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.examId}>
                  <td className="px-4 py-3 font-medium">{r.examName}</td>
                  <td className="px-4 py-3">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    {r.yearName} · {r.termName}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{r.percentage ?? "—"}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No exams recorded for this student in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <GraduationCap className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-medium">Choose a student</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a student above to view their academic history.
        </p>
      </div>
    );
  } else {
    const report = await gradeDistribution(access, { examId });
    csv = {
      headers: ["Grade", "Students"],
      rows: report.rows.map((r) => [r.grade, String(r.count)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Students graded</p>
            <p className="mt-1 text-2xl font-semibold">{report.total}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Bands</p>
            <p className="mt-1 text-2xl font-semibold">{report.bands.length}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Grade</th>
                <th className="px-4 py-3 text-right font-medium">Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.grade}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-muted-foreground">
                    {report.total === 0
                      ? "No results recorded for this exam yet."
                      : "No students were assigned a grade band."}
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
    view === "exam-results"
      ? "Exam result matrix"
      : view === "class-performance"
        ? "Class performance by exam"
        : view === "subject-performance"
          ? "Subject performance"
          : view === "history"
            ? "Student academic history"
            : "Grade distribution";

  return (
    <div className="flex flex-col gap-6">
      {printHeader(reportTitle)}
      <div className="print:hidden">
        <PageHeader
          title="Academic reports"
          description="Exam results, class/subject performance, histories and grade distribution."
          action={
            <div className="flex items-center gap-2">
              <PrintButton />
              {csv ? (
                <CsvExportButton
                  filename={`academic-${view}.csv`}
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

      {exams.length > 0 || view === "history" ? filterBar : null}
      {content}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
        <Info className="mt-0.5 size-3.5" aria-hidden="true" />
        Grades use the school&apos;s default grade scale. Percentages are marks-obtained over the
        exam&apos;s paper maxima; unrecorded subjects are excluded.
      </p>
    </div>
  );
}