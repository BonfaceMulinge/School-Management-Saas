import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { studentsScopeWhere } from "@/server/services/students";
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
  title: "Results",
};

const PAGE_SIZE = 20;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ResultsPage(props: PageProps<"/[school]/results">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "results:view", { next: `/${slug}` });

  const selfScoped = !access.isPlatformStaff && (
    access.membership?.role === "STUDENT" || access.membership?.role === "PARENT"
  );

  // Who can the viewer select / see results for?
  const scopedStudentIds = selfScoped ? await scopeStudentIds(access) : null;

  // @db.Date-agnostic helpers
  const defaultScale = await db.gradeScale.findFirst({
    where: { schoolId: access.schoolId, isDefault: true },
    include: { bands: true },
  });
  const bands = bandsToView(defaultScale?.bands ?? []);

  const requestedStudent = single(searchParams.studentId);
  let studentId: string | null = null;
  let student: Awaited<ReturnType<typeof loadStudent>> | null = null;
  let students: Awaited<ReturnType<typeof loadStudents>> | null = null;
  let totalStudents = 0;

  async function loadStudent(id: string) {
    const scope = await studentsScopeWhere(access);
    return db.student.findFirst({
      where: { id, schoolId: access.schoolId, ...scope },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            academicYear: true,
            term: true,
            class: true,
            stream: true,
          },
          orderBy: { academicYear: { startDate: "desc" } },
        },
      },
    });
  }

  async function loadStudents() {
    const scope = await studentsScopeWhere(access);
    const q = single(searchParams.q);
    const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);
    const where = {
      ...scope,
      schoolId: access.schoolId,
      archived: false,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { middleName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { studentNo: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const total = await db.student.count({ where });
    const rows = await db.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        studentNo: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: {
            class: { select: { name: true } },
            stream: { select: { name: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { rows, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  if (selfScoped) {
    // Parents/students: pick from their own linked students.
    const ids = scopedStudentIds ?? [];
    const picked =
      requestedStudent && ids.includes(requestedStudent) ? requestedStudent : ids[0] ?? null;
    if (picked) {
      student = await loadStudent(picked);
      studentId = picked;
    }
  } else {
    const data = await loadStudents();
    students = data;
    totalStudents = data.total;
    if (requestedStudent) {
      student = await loadStudent(requestedStudent);
      studentId = requestedStudent;
    }
  }

  const examScope = await examScopeWhere(access);

  // Exams available for this student (their enrolled classes, viewer-scoped).
  const studentExams = student
    ? await db.exam.findMany({
        where: {
          ...examScope,
          schoolId: access.schoolId,
          classId: { in: student.enrollments.map((e) => e.classId) },
          status: { not: "ARCHIVED" },
        },
        include: {
          academicYear: { select: { name: true, startDate: true, endDate: true } },
          term: { select: { name: true, startDate: true, endDate: true } },
          subjects: { include: { subject: { select: { id: true, name: true } } } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      })
    : null;

  // Selected exam report.
  const requestedExam = single(searchParams.examId);
  const selectedExam = studentExams?.find((e) => e.id === requestedExam) ?? studentExams?.[0] ?? null;

  let report: ReportCard | null = null;
  let rank: number | null = null;

  type ReportCard = {
    rows: Array<{
      subjectName: string;
      maxMarks: number;
      marksObtained: number | null;
      percentage: number | null;
      band: { grade: string; points: number | null; remark: string } | null;
    }>;
    obtained: number;
    max: number;
    satPapers: number;
    percentage: number | null;
    band: { grade: string; points: number | null; remark: string } | null;
  };

  if (studentId && selectedExam) {
    const exam = selectedExam;
    const allMarks = await db.examMark.findMany({
      where: { schoolId: access.schoolId, examId: exam.id },
      select: { studentId: true, subjectId: true, marksObtained: true },
    });
    const marksByStudent = new Map<string, Map<string, number>>();
    for (const m of allMarks) {
      const inner = marksByStudent.get(m.studentId) ?? new Map<string, number>();
      inner.set(m.subjectId, m.marksObtained.toNumber());
      marksByStudent.set(m.studentId, inner);
    }

    const papers = exam.subjects.map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subject.name,
      maxMarks: s.maxMarks.toNumber(),
    }));

    // Rank against every student who sat the exam in the same class/stream.
    const roster = await db.enrollment.findMany({
      where: {
        schoolId: access.schoolId,
        classId: exam.classId,
        academicYearId: exam.academicYearId,
        termId: exam.termId,
        status: "ACTIVE",
        ...(exam.streamId ? { streamId: exam.streamId } : {}),
        student: { archived: false },
      },
      select: { student: { select: { id: true } } },
    });
    const summaryRows = roster.map((r) => ({
      studentId: r.student.id,
      percentage: computeStudentExam(
        papers,
        marksByStudent.get(r.student.id) ?? new Map(),
        bands
      ).percentage,
    }));
    const ranked = addRanks(summaryRows);
    rank = ranked.find((r) => r.studentId === studentId)?.rank ?? null;

    const mine = computeStudentExam(
      papers,
      marksByStudent.get(studentId) ?? new Map(),
      bands
    );
    report = {
      rows: mine.rows.map((r) => ({
        subjectName: r.subjectName,
        maxMarks: r.maxMarks,
        marksObtained: r.obtained,
        percentage: r.percentage,
        band: r.band,
      })),
      obtained: mine.obtained,
      max: mine.max,
      satPapers: mine.satPapers,
      percentage: mine.percentage,
      band: mine.band,
    };
  }

  // Academic history: average % per term/year across the student's exams.
  const history: Array<{
    key: string;
    year: string;
    term: string;
    examsSat: number;
    average: number;
  }> = [];
  if (studentId) {
    const marks = await db.examMark.findMany({
      where: { schoolId: access.schoolId, studentId, exam: examScope },
      include: {
        exam: {
          include: {
            academicYear: { select: { name: true } },
            term: { select: { name: true } },
            subjects: true,
          },
        },
      },
    });

    // Group each exam's marks into a percentage, then average per term.
    const byExam = new Map<string, { exam: typeof marks[0]["exam"]; marks: number[]; max: number }>();
    for (const m of marks) {
      const entry = byExam.get(m.examId) ?? {
        exam: m.exam,
        marks: [] as number[],
        max: 0,
      };
      const paper = m.exam.subjects.find((s) => s.subjectId === m.subjectId);
      entry.marks.push(m.marksObtained.toNumber());
      entry.max += paper ? paper.maxMarks.toNumber() : 0;
      byExam.set(m.examId, entry);
    }
    const examPercentages: Array<{ year: string; term: string; pct: number }> = [];
    for (const entry of byExam.values()) {
      const total = entry.marks.reduce((a, b) => a + b, 0);
      const pct = entry.max > 0 && entry.marks.length > 0
        ? Math.round((total / entry.max) * 1000) / 10
        : 0;
      examPercentages.push({
        year: entry.exam.academicYear.name,
        term: entry.exam.term?.name ?? "—",
        pct,
      });
    }
    const byTerm = new Map<string, { year: string; term: string; pcts: number[] }>();
    for (const ep of examPercentages) {
      const key = `${ep.year}|${ep.term}`;
      const entry = byTerm.get(key) ?? { year: ep.year, term: ep.term, pcts: [] as number[] };
      entry.pcts.push(ep.pct);
      byTerm.set(key, entry);
    }
    for (const [key, entry] of byTerm) {
      const avg =
        entry.pcts.length > 0
          ? Math.round((entry.pcts.reduce((a, b) => a + b, 0) / entry.pcts.length) * 10) / 10
          : 0;
      history.push({ key, year: entry.year, term: entry.term, examsSat: entry.pcts.length, average: avg });
    }
    history.sort((a, b) => a.key.localeCompare(b.key));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Results"
        description="Student report cards and exam results."
      />

      {!selfScoped && !student ? (
        <section className="rounded-lg border border-border bg-card">
          <form method="get" className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <label className="flex min-w-64 flex-col gap-1 text-xs font-medium text-muted-foreground">
              Find a student
              <input
                name="q"
                defaultValue={single(searchParams.q) ?? ""}
                placeholder="Name or admission number…"
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Search
            </button>
            <a
              href={`/${slug}/results`}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
            >
              Reset
            </a>
          </form>
          {students && students.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <tbody className="divide-y divide-border">
                  {students.rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/${slug}/results?studentId=${encodeURIComponent(s.id)}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {fullName(s.firstName, s.middleName, s.lastName)}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {s.studentNo ?? "—"}
                          {s.enrollments[0] ? ` · ${s.enrollments[0].class.name}` : ""}
                          {s.enrollments[0]?.stream ? ` / ${s.enrollments[0].stream.name}` : ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {totalStudents === 0
                ? "No students in your scope yet."
                : "No students matched your search."}
            </p>
          )}
          {students && students.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {students.page} of {students.totalPages} · {students.total} students
              </span>
              <div className="flex items-center gap-2">
                {students.page > 1 ? (
                  <a
                    href={`/${slug}/results?${qs({ q: single(searchParams.q), page: String(students.page - 1) })}`}
                    className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                  >
                    Previous
                  </a>
                ) : null}
                {students.page < students.totalPages ? (
                  <a
                    href={`/${slug}/results?${qs({ q: single(searchParams.q), page: String(students.page + 1) })}`}
                    className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                  >
                    Next
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!student && !selfScoped ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">Select a student</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Search above to open a student&apos;s report card.
          </p>
        </div>
      ) : student ? (
        <>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Student</p>
              <p className="mt-1 text-sm font-medium">{fullName(student.firstName, student.middleName, student.lastName)}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Admission No.</p>
              <p className="mt-1 text-sm font-medium">{student.studentNo ?? "—"}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Current placement</p>
              <p className="mt-1 text-sm font-medium">
                {student.enrollments[0]
                  ? `${student.enrollments[0].class.name}${student.enrollments[0].stream ? ` / ${student.enrollments[0].stream.name}` : ""}`
                  : "Not enrolled"}
              </p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Exams available</p>
              <p className="mt-1 text-sm font-medium">{studentExams?.length ?? 0}</p>
            </div>
          </div>

          {studentExams && studentExams.length > 0 ? (
            <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
              <input type="hidden" name="studentId" value={student.id} />
              <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
                Exam
                <select
                  name="examId"
                  defaultValue={selectedExam?.id ?? ""}
                  onChange={(e) => e.currentTarget.form?.submit()}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {studentExams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.academicYear.name} · {e.term?.name ?? "—"} · {formatDate(e.date)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Open report
              </button>
            </form>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No exams are available for this student&apos;s classes yet.
            </div>
          )}

          {selectedExam && report ? (
            <section className="overflow-hidden rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">
                    {selectedExam.name} — report card
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {school.name} · {selectedExam.academicYear.name} · {selectedExam.term?.name ?? "—"} ·{" "}
                    {formatDate(selectedExam.date)}
                    {rank !== null ? ` · Rank ${rank} of the class` : ""}
                  </p>
                </div>
                <Badge variant="outline">
                  {report.percentage === null ? "No marks" : `${report.percentage}%`}
                </Badge>
              </div>
              <div className="overflow-x-auto bg-card">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Subject</th>
                      <th className="px-4 py-3 text-center font-medium">Mark</th>
                      <th className="px-4 py-3 text-center font-medium">Max</th>
                      <th className="px-4 py-3 text-center font-medium">%</th>
                      <th className="px-4 py-3 text-center font-medium">Grade</th>
                      <th className="px-4 py-3 text-center font-medium">Pts</th>
                      <th className="px-4 py-3 text-left font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.rows.map((r) => (
                      <tr key={r.subjectName}>
                        <td className="px-4 py-3 font-medium">{r.subjectName}</td>
                        <td className="px-4 py-3 text-center">
                          {r.marksObtained === null ? "—" : r.marksObtained}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{r.maxMarks}</td>
                        <td className="px-4 py-3 text-center">
                          {r.percentage === null ? "—" : `${r.percentage}%`}
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {r.band?.grade ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-muted-foreground">
                          {r.band?.points ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.band?.remark ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/30">
                    <tr>
                      <td className="px-4 py-3 font-semibold">Total</td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {report.satPapers > 0 ? report.obtained : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {report.max > 0 ? report.max : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {report.percentage === null ? "—" : `${report.percentage}%`}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">
                        {report.band?.grade ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {report.band?.points ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {report.band?.remark ?? "—"}
                      </td>
                    </tr>
</tfoot>
                </table>
              </div>
            </section>
          ) : null}

          {history.length > 0 ? (
            <section className="overflow-hidden rounded-lg border border-border">
              <div className="border-b border-border bg-card px-5 py-4">
                <h2 className="text-sm font-semibold">Academic history</h2>
                <p className="text-xs text-muted-foreground">Average % across exams, per term and year.</p>
              </div>
              <div className="overflow-x-auto bg-card">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Year</th>
                      <th className="px-4 py-3 text-left font-medium">Term</th>
                      <th className="px-4 py-3 text-center font-medium">Exams sat</th>
                      <th className="px-4 py-3 text-center font-medium">Average %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((h) => (
                      <tr key={h.key}>
                        <td className="px-4 py-3">{h.year}</td>
                        <td className="px-4 py-3">{h.term}</td>
                        <td className="px-4 py-3 text-center">{h.examsSat}</td>
                        <td className="px-4 py-3 text-center font-medium">{h.average}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {!selfScoped ? (
            <Link
              href={`/${slug}/results`}
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Back to students
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function qs(extra: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) {
    if (v) params.set(k, v);
  }
  const s = params.toString();
  return s;
}