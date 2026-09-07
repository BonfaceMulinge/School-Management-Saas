import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  examScopeWhere,
  examRoster,
  canManageExamFor,
  canManageSubjectFor,
} from "@/server/services/exams";
import {
  bandsToView,
  computeStudentExam,
  gradeFor,
  addRanks,
} from "@/server/services/results";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";
import { MarksForm, type MarksRowView } from "./marks-form";
import { PapersSection } from "./papers-section";

export const metadata: Metadata = {
  title: "Exam results",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

const TYPE_LABELS: Record<string, string> = {
  CAT: "CAT",
  MIDTERM: "Midterm",
  END_TERM: "End Term",
  ASSIGNMENT: "Assignment",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ExamDetailPage(
  props: PageProps<"/[school]/exams/[examId]">
) {
  const { school: slug, examId } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "exams:view", { next: `/${slug}` }),
    canAccess(slug, "exams:manage"),
  ]);

  // Students and parents see only their own results — on the results page.
  if (
    !access.isPlatformStaff &&
    (access.membership?.role === "STUDENT" || access.membership?.role === "PARENT")
  ) {
    redirect(`/${slug}/results?examId=${encodeURIComponent(examId)}`);
  }

  const scope = await examScopeWhere(access);
  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId: access.schoolId, ...scope },
    include: {
      academicYear: { select: { name: true } },
      term: { select: { name: true } },
      class: { select: { name: true } },
      stream: { select: { name: true } },
      subjects: {
        include: { subject: { select: { id: true, name: true, code: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!exam) notFound();

  const archived = exam.status === "ARCHIVED";
  const canManageExam =
    canManage && !archived && (await canManageExamFor(access, exam.classId, exam.streamId));

  const storedPapers = await db.examPaper.findMany({
    where: { examId: exam.id },
    select: { subjectId: true, fileName: true, sizeBytes: true },
  });
  const paperBySubject = new Map(storedPapers.map((p) => [p.subjectId, p]));
  const canManagePaperBySubject: Record<string, boolean> = {};
  for (const s of exam.subjects) {
    canManagePaperBySubject[s.subjectId] =
      canManageExam &&
      (await canManageSubjectFor(access, s.subjectId, exam.classId, exam.streamId));
  }

  const roster = await examRoster(exam);
  const papers = exam.subjects.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subject.name,
    maxMarks: s.maxMarks.toNumber(),
  }));

  // All marks for this exam (drives the whole-exam summary).
  const allMarks = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId: exam.id },
    select: { subjectId: true, studentId: true, marksObtained: true },
  });
  const marksByStudent = new Map<string, Map<string, number>>();
  for (const m of allMarks) {
    const inner = marksByStudent.get(m.studentId) ?? new Map<string, number>();
    inner.set(m.subjectId, m.marksObtained.toNumber());
    marksByStudent.set(m.studentId, inner);
  }

  const defaultScale = await db.gradeScale.findFirst({
    where: { schoolId: access.schoolId, isDefault: true },
    include: { bands: true },
  });
  const bands = bandsToView(defaultScale?.bands ?? []);
  const hasScale = defaultScale !== null;

  const summaryRows = addRanks(
    roster.map((row) => {
      const computed = computeStudentExam(
        papers,
        marksByStudent.get(row.student.id) ?? new Map(),
        bands
      );
      return {
        studentId: row.student.id,
        name: fullName(row.student.firstName, row.student.middleName, row.student.lastName),
        studentNo: row.student.studentNo,
        marks: computed.rows,
        obtained: computed.obtained,
        max: computed.max,
        satPapers: computed.satPapers,
        percentage: computed.percentage,
        band: computed.band,
      };
    })
  );

  // Selected subject (marks-entry pane).
  const requestedSubject = single(searchParams.subjectId);
  const selectedIndex = Math.max(
    0,
    exam.subjects.findIndex((s) => s.subjectId === requestedSubject)
  );
  const selectedPaper = exam.subjects[selectedIndex] ?? null;
  const paperEdge = selectedPaper
    ? {
        examSubjectId: selectedPaper.id,
        subjectId: selectedPaper.subjectId,
        maxMarks: selectedPaper.maxMarks.toNumber(),
      }
    : null;

  const subjectMarks = selectedPaper
    ? await db.examMark.findMany({
        where: {
          schoolId: access.schoolId,
          examId: exam.id,
          examSubjectId: selectedPaper.id,
        },
        select: { id: true, studentId: true, marksObtained: true },
      })
    : [];
  const markByStudent = new Map(subjectMarks.map((m) => [m.studentId, m]));

  const canEditPaper =
    canManageExam &&
    paperEdge !== null &&
    (await canManageSubjectFor(access, paperEdge.subjectId, exam.classId, exam.streamId));

  const marksRows: MarksRowView[] = roster.map((row) => {
    const existing = markByStudent.get(row.student.id);
    const obtained =
      existing === undefined
        ? null
        : { id: existing.id, value: existing.marksObtained.toNumber() };
    const percentage =
      obtained === null || paperEdge === null
        ? null
        : Math.round((obtained.value / paperEdge.maxMarks) * 1000) / 10;
    return {
      studentId: row.student.id,
      name: fullName(row.student.firstName, row.student.middleName, row.student.lastName),
      studentNo: row.student.studentNo,
      obtained,
      percentage,
      band: percentage === null || !hasScale ? null : gradeFor(bands, percentage),
      editable: canEditPaper,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={exam.name}
        description={`${TYPE_LABELS[exam.type] ?? exam.type} · ${formatDate(exam.date)}`}
        action={
          exam.status === "ARCHIVED" ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            <Badge>{STATUS_LABELS[exam.status] ?? exam.status}</Badge>
          )
        }
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Year / Term</p>
          <p className="mt-1 text-sm font-medium">
            {exam.academicYear.name} · {exam.term.name}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Class / Stream</p>
          <p className="mt-1 text-sm font-medium">
            {exam.class.name}
            {exam.stream ? ` / ${exam.stream.name}` : ""}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Papers</p>
          <p className="mt-1 text-sm font-medium">{exam.subjects.length}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Students</p>
          <p className="mt-1 text-sm font-medium">{roster.length}</p>
        </div>
      </div>

      <PapersSection
        slug={slug}
        examId={exam.id}
        canManageBySubject={canManagePaperBySubject}
        papers={exam.subjects.map((s) => ({
          subjectId: s.subjectId,
          subjectName: s.subject.name,
          fileName: paperBySubject.get(s.subjectId)?.fileName ?? null,
          sizeBytes: paperBySubject.get(s.subjectId)?.sizeBytes ?? null,
        }))}
      />

      {/* Whole-exam summary */}
      <section className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold">Exam summary</h2>
          <p className="text-xs text-muted-foreground">
            {roster.length} students · {papers.length} papers
            {hasScale ? " · graded with the default scale" : " · no grading scale configured yet"}
          </p>
        </div>
        {summaryRows.length === 0 ? (
          <div className="bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            No enrolled students for this exam.
          </div>
        ) : (
          <div className="overflow-x-auto bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  {papers.map((p) => (
                    <th key={p.subjectId} className="px-4 py-3 text-center font-medium">
                      {p.subjectName}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center font-medium">Total</th>
                  <th className="px-4 py-3 text-center font-medium">%</th>
                  <th className="px-4 py-3 text-center font-medium">Grade</th>
                  <th className="px-4 py-3 text-center font-medium">Pts</th>
                  <th className="px-4 py-3 text-center font-medium">Rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summaryRows.map((row) => (
                  <tr key={row.studentId}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                    </td>
                    {row.marks.map((m) => (
                      <td key={m.subjectId} className="px-4 py-2.5 text-center">
                        {m.obtained ?? "—"}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center font-medium">
                      {row.max > 0 ? `${row.obtained} / ${row.max}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {row.percentage === null ? "—" : `${row.percentage}%`}
                    </td>
                    <td className="px-4 py-2.5 text-center font-medium">
                      {row.band?.grade ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      {row.band?.points ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">
                      {row.rank ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-subject marks entry */}
      <section className="overflow-hidden rounded-lg border border-border">
        <div className="border-b border-border bg-card px-5 py-4">
          <h2 className="text-sm font-semibold">Subject marks</h2>
          <p className="text-xs text-muted-foreground">
            Select a paper to record or review results.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {exam.subjects.map((s) => (
              <Link
                key={s.id}
                href={`/${slug}/exams/${exam.id}?subjectId=${encodeURIComponent(s.subjectId)}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  s.subjectId === selectedPaper?.subjectId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.subject.name} · {s.maxMarks.toNumber()}
              </Link>
            ))}
          </div>
        </div>

        {!selectedPaper || paperEdge === null ? (
          <div className="bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            This exam has no subjects yet.{" "}
            <Link className="text-primary hover:underline" href={`/${slug}/exams`}>
              Edit the exam
            </Link>{" "}
            to add papers.
          </div>
        ) : marksRows.length === 0 ? (
          <div className="bg-card px-6 py-12 text-center">
            <ClipboardList className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <h3 className="mt-3 text-sm font-medium">No enrolled students</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              No active enrolment matches this exam&apos;s class/stream in the selected year and term.
            </p>
          </div>
        ) : !canEditPaper ? (
          <div className="overflow-x-auto bg-card">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-center font-medium">
                    Marks / {paperEdge.maxMarks}
                  </th>
                  <th className="px-4 py-3 text-center font-medium">%</th>
                  <th className="px-4 py-3 text-center font-medium">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {marksRows.map((row) => (
                  <tr key={row.studentId}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.studentNo ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {row.obtained === null ? (
                        <span className="text-muted-foreground">Not recorded</span>
                      ) : (
                        row.obtained.value
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {row.percentage === null ? "—" : `${row.percentage}%`}
                    </td>
                    <td className="px-4 py-2.5 text-center font-medium">
                      {row.band?.grade ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-card">
            <MarksForm
              slug={slug}
              examId={exam.id}
              examSubjectId={paperEdge.examSubjectId}
              subjectName={selectedPaper.subject.name}
              maxMarks={paperEdge.maxMarks}
              rows={marksRows}
            />
          </div>
        )}
      </section>
    </div>
  );
}