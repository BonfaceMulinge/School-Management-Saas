import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { examScopeWhere, scopeStudentIds } from "@/server/services/exams";
import {
  bandsToView,
  computeStudentExam,
  addRanks,
} from "@/server/services/results";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";

export const metadata: Metadata = {
  title: "Academic reports",
};

const PAGE_SIZE = 25;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AcademicReportsPage(
  props: PageProps<"/[school]/results/reports">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "results:view", { next: `/${slug}` });

  const view = single(searchParams.view) === "subject" ? "subject" : "class";
  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const examId = single(searchParams.examId);
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const subjectId = single(searchParams.subjectId);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const scope = await examScopeWhere(access);
  const isTeacher = access.membership?.role === "TEACHER" && !access.isPlatformStaff;

  const [years, subjects] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.subject.findMany({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: { name: "asc" },
    }),
  ]);

  const classes = await db.class.findMany({
    where: {
      schoolId: access.schoolId,
      archived: false,
      ...(isTeacher ? { assignments: { some: { teacherId: access.user.id } } } : {}),
    },
    include: {
      streams: { where: { archived: false }, select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const examsWhere = {
    ...scope,
    schoolId: access.schoolId,
    status: { not: "ARCHIVED" as const },
    ...(yearId ? { academicYearId: yearId } : {}),
    ...(termId ? { termId } : {}),
    ...(classId ? { classId } : {}),
    ...(streamId ? { streamId } : {}),
  };

  const exams = await db.exam.findMany({
    where: examsWhere,
    include: {
      academicYear: { select: { name: true } },
      term: { select: { name: true } },
      class: { select: { name: true } },
      stream: { select: { name: true } },
      subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const defaultScale = await db.gradeScale.findFirst({
    where: { schoolId: access.schoolId, isDefault: true },
    include: { bands: true },
  });
  const bands = bandsToView(defaultScale?.bands ?? []);
  const hasScale = defaultScale !== null;

  const selectedExam = exams.find((e) => e.id === examId) ?? null;
  const selectedClass = classes.find((c) => c.id === classId) ?? null;

  const qsLink = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (yearId) params.set("yearId", yearId);
    if (termId) params.set("termId", termId);
    if (examId) params.set("examId", examId);
    if (classId) params.set("classId", classId);
    if (streamId) params.set("streamId", streamId);
    if (subjectId) params.set("subjectId", subjectId);
    params.set("view", view);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    return `/${slug}/results/reports?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Academic reports"
        description="Class and subject performance across exams."
      />

      <form method="get" className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
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
            {selectedClass?.streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Exam
          <select name="examId" defaultValue={examId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">—</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.class.name}
              </option>
            ))}
          </select>
        </label>
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
        <div className="flex items-end gap-2">
          <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Run
          </button>
          <a href={`/${slug}/results/reports`} className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted">
            Reset
          </a>
        </div>
        <div className="flex items-end justify-end gap-1 sm:col-span-2 lg:col-span-1">
          <a
            href={qsLink({ view: "class" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              view === "class"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Class view
          </a>
          <a
            href={qsLink({ view: "subject" })}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              view === "subject"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            Subject view
          </a>
        </div>
      </form>

      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <BarChart3 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No exams match your filters</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Widen the year, term, class or stream filters to see exams.
          </p>
        </div>
      ) : view === "class" ? (
        selectedExam ? (
          <ClassPerformance
            slug={slug}
            exam={selectedExam}
            bands={bands}
            hasScale={hasScale}
            pageParam={page}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            Pick an exam to see its class performance report.
          </div>
        )
      ) : (
        <SubjectPerformance
          slug={slug}
          subjectId={subjectId ?? ""}
          exams={exams}
          yearId={yearId}
          termId={termId}
        />
      )}
    </div>
  );
}

async function ClassPerformance({
  slug,
  exam,
  bands,
  hasScale,
  pageParam,
}: {
  slug: string;
  exam: ExamWith;
  bands: ReturnType<typeof bandsToView>;
  hasScale: boolean;
  pageParam: number;
}) {
  const access = await requirePermission(slug, "results:view");

  // Non-staff viewers (parents, students, teachers) only ever see results for
  // students in their own scope — never an entire class roster.
  const scoped = await scopeStudentIds(access);

  const papers = exam.subjects.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subject.name,
    maxMarks: s.maxMarks.toNumber(),
  }));

  const marks = await db.examMark.findMany({
    where: {
      schoolId: access.schoolId,
      examId: exam.id,
      ...(scoped ? { studentId: { in: scoped } } : {}),
    },
    select: { subjectId: true, studentId: true, marksObtained: true },
  });
  const marksByStudent = new Map<string, Map<string, number>>();
  for (const m of marks) {
    const inner = marksByStudent.get(m.studentId) ?? new Map<string, number>();
    inner.set(m.subjectId, m.marksObtained.toNumber());
    marksByStudent.set(m.studentId, inner);
  }

  const roster = await db.enrollment.findMany({
    where: {
      schoolId: access.schoolId,
      classId: exam.classId,
      academicYearId: exam.academicYearId,
      termId: exam.termId,
      status: "ACTIVE",
      ...(exam.streamId ? { streamId: exam.streamId } : {}),
      student: { archived: false, ...(scoped ? { id: { in: scoped } } : {}) },
    },
    select: {
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          studentNo: true,
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });

  const all = roster.map((row) => {
    const s = row.student;
    const computed = computeStudentExam(
      papers,
      marksByStudent.get(s.id) ?? new Map(),
      bands
    );
    return {
      studentId: s.id,
      name: fullName(s.firstName, s.middleName, s.lastName),
      studentNo: s.studentNo,
      obtained: computed.obtained,
      max: computed.max,
      percentage: computed.percentage,
      band: computed.band,
    };
  });
  const ranked = addRanks(all);

  const percentages = ranked.map((r) => r.percentage).filter((p): p is number => p !== null);
  const avg =
    percentages.length > 0
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
      : null;
  const highest = percentages.length > 0 ? Math.max(...percentages) : null;
  const lowest = percentages.length > 0 ? Math.min(...percentages) : null;

  const totalPages = Math.max(1, Math.ceil(ranked.length / PAGE_SIZE));
  const pageRows = ranked.slice((pageParam - 1) * PAGE_SIZE, pageParam * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Class</p>
          <p className="mt-1 text-sm font-medium">
            {exam.class.name}
            {exam.stream ? ` / ${exam.stream.name}` : ""}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Students</p>
          <p className="mt-1 text-sm font-medium">{ranked.length}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Class average</p>
          <p className="mt-1 text-sm font-medium">{avg === null ? "—" : `${avg}%`}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Range</p>
          <p className="mt-1 text-sm font-medium">
            {highest === null ? "—" : `${lowest}% – ${highest}%`}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{exam.name} — class performance</h2>
            <p className="text-xs text-muted-foreground">
              {exam.academicYear.name} · {exam.term?.name ?? "—"} · {formatDate(exam.date)}
            </p>
          </div>
          <Badge variant="outline">Ranking included</Badge>
        </div>
        <div className="overflow-x-auto bg-card">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-center font-medium">Total</th>
                <th className="px-4 py-3 text-center font-medium">%</th>
                <th className="px-4 py-3 text-center font-medium">Grade</th>
                <th className="px-4 py-3 text-center font-medium">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((row) => (
                <tr key={row.studentId}>
                  <td className="px-4 py-3 text-center font-medium">{row.rank ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.max > 0 ? `${row.obtained} / ${row.max}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.percentage === null ? "—" : `${row.percentage}%`}
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{row.band?.grade ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {row.band?.points ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!hasScale ? (
          <p className="border-t border-border bg-card px-5 py-3 text-xs text-muted-foreground">
            No default grading scale configured — grades are not shown.
          </p>
        ) : null}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>Page {pageParam} of {totalPages}</span>
            <div className="flex items-center gap-2">
              {pageParam > 1 ? (
                <a href={pageUrl(slug, exam.id, pageParam - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
                  Previous
                </a>
              ) : null}
              {pageParam < totalPages ? (
                <a href={pageUrl(slug, exam.id, pageParam + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
                  Next
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function pageUrl(slug: string, examId: string, page: number): string {
  return `/${slug}/results/reports?view=class&examId=${encodeURIComponent(examId)}&page=${page}`;
}

type ExamWith = {
  id: string;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId: string | null;
  name: string;
  date: Date;
  subjects: Array<{
    subjectId: string;
    maxMarks: { toNumber: () => number };
    subject: { id: string; name: string; code: string };
  }>;
  academicYear: { name: string };
  term: { name: string } | null;
  class: { name: string };
  stream: { name: string } | null;
};

async function SubjectPerformance({
  slug,
  subjectId,
  exams,
  yearId,
  termId,
}: {
  slug: string;
  subjectId: string;
  exams: ExamWith[];
  yearId: string | undefined;
  termId: string | undefined;
}) {
  const access = await requirePermission(slug, "results:view");
  const scoped = await scopeStudentIds(access);
  const subject = await db.subject.findFirst({
    where: { id: subjectId, schoolId: access.schoolId, archived: false },
    select: { id: true, name: true, code: true },
  });

  if (!subject) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        Pick a subject to see subject performance.
      </div>
    );
  }

  // Per-exam and per-student rows for the chosen subject.
  const withSubject = exams
    .map((exam) => ({
      exam,
      paper: exam.subjects.find((s) => s.subjectId === subject.id),
    }))
    .filter((r): r is { exam: ExamWith; paper: NonNullable<ExamWith["subjects"][number]> } =>
      r.paper !== undefined
    );

  const rows: Array<{
    examId: string;
    examName: string;
    examDate: Date;
    examClass: string;
    maxMarks: number;
    recorded: number;
    roster: number;
    averageMark: number | null;
    averagePct: number | null;
    highest: number | null;
    lowest: number | null;
  }> = [];

  for (const { exam, paper } of withSubject) {
    const marks = await db.examMark.findMany({
      where: {
        schoolId: access.schoolId,
        examId: exam.id,
        subjectId: subject.id,
        ...(scoped ? { studentId: { in: scoped } } : {}),
      },
      include: {
        student: {
          select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
        },
      },
    });
    const roster = await db.enrollment.count({
      where: {
        schoolId: access.schoolId,
        classId: exam.classId,
        academicYearId: exam.academicYearId,
        termId: exam.termId,
        status: "ACTIVE",
        ...(exam.streamId ? { streamId: exam.streamId } : {}),
        student: { archived: false, ...(scoped ? { id: { in: scoped } } : {}) },
      },
    });
    const values = marks.map((m) => m.marksObtained.toNumber());
    const maxMarks = paper.maxMarks.toNumber();
    const averageMark =
      values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
    const averagePct = averageMark === null ? null : Math.round((averageMark / maxMarks) * 1000) / 10;
    rows.push({
      examId: exam.id,
      examName: exam.name,
      examDate: exam.date,
      examClass: exam.class.name,
      maxMarks,
      recorded: values.length,
      roster,
      averageMark,
      averagePct,
      highest: values.length > 0 ? Math.max(...values) : null,
      lowest: values.length > 0 ? Math.min(...values) : null,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <h2 className="text-sm font-semibold">
          {subject.name} ({subject.code})
        </h2>
        <p className="text-xs text-muted-foreground">
          {yearId || termId ? "Across the selected year/term·" : ""} {withSubject.length} exam{withSubject.length === 1 ? "" : "s"} with this subject.
        </p>
      </div>

      {withSubject.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No exams in range include this subject.
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Exam</th>
                  <th className="px-4 py-3 text-left font-medium">Class</th>
                  <th className="px-4 py-3 text-center font-medium">Max</th>
                  <th className="px-4 py-3 text-center font-medium">Recorded</th>
                  <th className="px-4 py-3 text-center font-medium">Average</th>
                  <th className="px-4 py-3 text-center font-medium">Avg %</th>
                  <th className="px-4 py-3 text-center font-medium">Low – High</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.examId}>
                    <td className="px-4 py-3 font-medium">
                      {r.examName}
                      <div className="text-xs font-normal text-muted-foreground">{formatDate(r.examDate)}</div>
                    </td>
                    <td className="px-4 py-3">{r.examClass}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{r.maxMarks}</td>
                    <td className="px-4 py-3 text-center">
                      {r.recorded} / {r.roster}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.averageMark === null ? "—" : r.averageMark}
                    </td>
                    <td className="px-4 py-3 text-center font-medium">
                      {r.averagePct === null ? "—" : `${r.averagePct}%`}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {r.lowest === null ? "—" : `${r.lowest} – ${r.highest}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}