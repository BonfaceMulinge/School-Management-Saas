import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
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
import {
  reportCardsCsv,
  type ReportCardMeta,
  type ReportCardStudent,
} from "@/lib/report-card-csv";
import { PrintButton, DownloadCsvButton } from "./report-card-actions";
import { ReportCardSheet } from "./report-card-sheet";

export const metadata: Metadata = {
  title: "Report Cards",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ReportCardsPage(
  props: PageProps<"/[school]/results/report-cards">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "results:view", { next: `/${slug}` });
  const canManageResults = await canAccess(slug, "results:manage");

  const selfScoped = !access.isPlatformStaff && (
    access.membership?.role === "STUDENT" || access.membership?.role === "PARENT"
  );
  const scopedStudentIds = selfScoped ? await scopeStudentIds(access) : null;

  const yearId = single(searchParams.yearId);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const examId = single(searchParams.examId);
  const onlyStudentId = single(searchParams.studentId);

  const scope = await examScopeWhere(access);

  const [years, classes, exams, defaultScale] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { where: { archived: false }, select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { streams: { where: { archived: false }, select: { id: true, name: true } } },
      orderBy: [{ level: "asc" }, { name: "asc" }],
    }),
    db.exam.findMany({
      where: {
        ...scope,
        schoolId: access.schoolId,
        status: { not: "ARCHIVED" as const },
        ...(yearId ? { academicYearId: yearId } : {}),
        ...(termId ? { termId } : {}),
        ...(classId ? { classId } : {}),
        ...(streamId ? { streamId } : {}),
      },
      include: {
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.gradeScale.findFirst({
      where: { schoolId: access.schoolId, isDefault: true },
      include: { bands: true },
    }),
  ]);

  const bands = bandsToView(defaultScale?.bands ?? []);
  const selectedClass = classes.find((c) => c.id === classId) ?? null;
  const selectedExam = exams.find((e) => e.id === examId) ?? null;

  // Compute every report card for the selected exam.
  let cards: ReportCardStudent[] = [];
  let meta: ReportCardMeta | null = null;
  let releaseBlocked = false;

  if (selectedExam) {
    const papers = await db.examSubject.findMany({
      where: { examId: selectedExam.id },
      orderBy: { sortOrder: "asc" },
      include: { subject: { select: { id: true, name: true } } },
    });

    const marks = await db.examMark.findMany({
      where: {
        schoolId: access.schoolId,
        examId: selectedExam.id,
        ...(scopedStudentIds ? { studentId: { in: scopedStudentIds } } : {}),
      },
      select: { studentId: true, subjectId: true, marksObtained: true, remark: true },
    });
    const marksByStudent = new Map<
      string,
      Map<string, { marksObtained: number; remark: string | null }>
    >();
    for (const m of marks) {
      const inner = marksByStudent.get(m.studentId) ?? new Map();
      inner.set(m.subjectId, {
        marksObtained: m.marksObtained.toNumber(),
        remark: m.remark,
      });
      marksByStudent.set(m.studentId, inner);
    }

    const roster = await db.enrollment.findMany({
      where: {
        schoolId: access.schoolId,
        classId: selectedExam.classId,
        academicYearId: selectedExam.academicYearId,
        termId: selectedExam.termId,
        status: "ACTIVE",
        ...(selectedExam.streamId ? { streamId: selectedExam.streamId } : {}),
        student: {
          archived: false,
          ...(scopedStudentIds ? { id: { in: scopedStudentIds } } : {}),
        },
      },
      select: {
        pathway: { select: { name: true } },
        combination: { select: { name: true } },
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

    const paperViews = papers.map((p) => ({
      subjectId: p.subjectId,
      subjectName: p.subject.name,
      maxMarks: p.maxMarks.toNumber(),
    }));

    const ranked = addRanks(
      roster.map((row) => {
        const computed = computeStudentExam(
          paperViews,
          marksByStudent.get(row.student.id) ?? new Map(),
          bands
        );
        return {
          studentId: row.student.id,
          name: fullName(
            row.student.firstName,
            row.student.middleName,
            row.student.lastName
          ),
          studentNo: row.student.studentNo,
          pathway: row.pathway?.name ?? null,
          combination: row.combination?.name ?? null,
          obtained: computed.obtained,
          max: computed.max,
          percentage: computed.percentage,
          band: computed.band,
          rank: null as number | null,
          rows: computed.rows,
        };
      })
    );

    cards = ranked.map((row) => ({
      studentId: row.studentId,
      name: row.name,
      studentNo: row.studentNo,
      pathway: row.pathway,
      combination: row.combination,
      obtained: row.obtained,
      max: row.max,
      percentage: row.percentage,
      grade: row.band?.grade ?? null,
      points: row.band?.points ?? null,
      rank: row.rank,
      rows: row.rows.map((r) => ({
        subjectName: r.subjectName,
        maxMarks: r.maxMarks,
        marksObtained: r.obtained,
        percentage: r.percentage,
        grade: r.band?.grade ?? null,
        points: r.band?.points ?? null,
        remark: r.remark,
      })),
    }));

    // Report cards are only released once an admin verifies the results.
    releaseBlocked = selectedExam.status !== "COMPLETED";

    meta = {
      schoolName: school.name,
      examName: selectedExam.name,
      yearName: selectedExam.academicYear.name,
      termName: selectedExam.term.name,
      className: selectedExam.class.name,
      streamName: selectedExam.stream?.name ?? null,
    };
  }

  const visibleCards = onlyStudentId
    ? cards.filter((c) => c.studentId === onlyStudentId)
    : cards;

  const percentages = cards.map((c) => c.percentage).filter((p): p is number => p !== null);
  const average =
    percentages.length > 0
      ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
      : null;
  const top = cards
    .filter((c) => c.percentage !== null)
    .sort((a, b) => (b.percentage as number) - (a.percentage as number))
    .slice(0, 5);
  const bottom = [...cards]
    .filter((c) => c.percentage !== null)
    .sort((a, b) => (a.percentage as number) - (b.percentage as number))
    .slice(0, 5);

  const cardSchool = {
    name: school.name,
    address: school.address,
    phone: school.phone,
    email: school.email,
    motto: school.motto,
    logoUrl: school.logoUrl,
  };

  const csv = meta && visibleCards.length > 0 ? reportCardsCsv(meta, visibleCards) : "";
  const csvFilename = meta
    ? `report-cards-${meta.className.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${meta.examName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.csv`
    : "report-cards.csv";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report Cards"
        description="Printable end-of-term report cards for a class, with CSV export. Results must be verified before cards are released."
        action={
          selectedExam && visibleCards.length > 0 ? (
            <div className="flex items-center gap-2">
              <DownloadCsvButton filename={csvFilename} csv={csv} />
              <PrintButton
                label={onlyStudentId ? "Print this card" : `Print all ${visibleCards.length} cards`}
              />
            </div>
          ) : undefined
        }
      />

      <form
        method="get"
        className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        {onlyStudentId ? <input type="hidden" name="studentId" value={onlyStudentId} /> : null}
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
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Stream
          <select
            name="streamId"
            defaultValue={streamId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
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
          <select
            name="examId"
            defaultValue={examId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">—</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.class.name}
                {e.stream ? ` / ${e.stream.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Load report cards
          </button>
          <a
            href={`/${slug}/results/report-cards`}
            className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
          >
            Reset
          </a>
          {onlyStudentId ? (
            <Link
              href={`/${slug}/results/report-cards?examId=${encodeURIComponent(selectedExam?.id ?? "")}`}
              className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
            >
              Back to all cards
            </Link>
          ) : null}
        </div>
      </form>

      {!selectedExam ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">Choose an exam</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a year, term and class above to generate printable report cards.
          </p>
        </div>
      ) : (
        <>
          {releaseBlocked ? (
            <div className="rounded-lg border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
              These results have not been verified yet, so the cards below are a preview.{" "}
              {canManageResults ? (
                <Link
                  href={`/${slug}/exams/${selectedExam.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  Verify and release them
                </Link>
              ) : (
                "Ask an administrator to verify and release them."
              )}
            </div>
          ) : null}

          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Exam</p>
              <p className="mt-1 text-sm font-medium">
                {selectedExam.name} · {formatDate(selectedExam.date)}
              </p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Class / Stream</p>
              <p className="mt-1 text-sm font-medium">
                {selectedExam.class.name}
                {selectedExam.stream ? ` · ${selectedExam.stream.name}` : ""}
              </p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Students</p>
              <p className="mt-1 text-sm font-medium">{cards.length}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Class average</p>
              <p className="mt-1 text-sm font-medium">{average === null ? "—" : `${average}%`}</p>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No students are enrolled for this exam&apos;s class, stream, year and term.
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold">Report card list</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedExam.academicYear.name} · {selectedExam.term.name} · positions are
                      based on the overall percentage in this exam.
                    </p>
                  </div>
                  <Badge variant={releaseBlocked ? "outline" : "secondary"}>
                    {releaseBlocked ? "Preview — not verified" : "Released"}
                  </Badge>
                </div>
                <div className="overflow-x-auto bg-card">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-center font-medium">Position</th>
                        <th className="px-4 py-3 text-left font-medium">Student</th>
                        <th className="px-4 py-3 text-center font-medium">Total</th>
                        <th className="px-4 py-3 text-center font-medium">%</th>
                        <th className="px-4 py-3 text-center font-medium">Grade</th>
                        <th className="px-4 py-3 text-center font-medium">Pts</th>
                        <th className="px-4 py-3 text-right font-medium">Report card</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cards.map((card) => (
                        <tr key={card.studentId}>
                          <td className="px-4 py-2.5 text-center font-medium">
                            {card.rank ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{card.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {card.studentNo ?? "—"}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {card.max > 0 ? `${card.obtained} / ${card.max}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {card.percentage === null ? "—" : `${card.percentage}%`}
                          </td>
                          <td className="px-4 py-2.5 text-center font-medium">
                            {card.grade ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center text-muted-foreground">
                            {card.points ?? "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/${slug}/results/report-cards?examId=${encodeURIComponent(
                                selectedExam.id
                              )}&studentId=${encodeURIComponent(card.studentId)}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              View card
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {!onlyStudentId ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-lg border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold">Highest performers</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Top five students by overall percentage.
                    </p>
                    <ol className="mt-3 space-y-2 text-sm">
                      {top.map((c) => (
                        <li key={c.studentId} className="flex items-center justify-between gap-3">
                          <span>
                            {c.rank ? `${c.rank}. ` : ""}
                            {c.name}
                          </span>
                          <span className="font-medium">{c.percentage}%</span>
                        </li>
                      ))}
                      {top.length === 0 ? (
                        <li className="text-sm text-muted-foreground">No marks recorded yet.</li>
                      ) : null}
                    </ol>
                  </section>
                  <section className="rounded-lg border border-border bg-card p-5">
                    <h2 className="text-sm font-semibold">Lowest performers</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Bottom five students by overall percentage — candidates for support.
                    </p>
                    <ol className="mt-3 space-y-2 text-sm">
                      {bottom.map((c) => (
                        <li key={c.studentId} className="flex items-center justify-between gap-3">
                          <span>{c.name}</span>
                          <span className="font-medium">{c.percentage}%</span>
                        </li>
                      ))}
                      {bottom.length === 0 ? (
                        <li className="text-sm text-muted-foreground">No marks recorded yet.</li>
                      ) : null}
                    </ol>
                  </section>
                </div>
              ) : null}

              {meta && visibleCards.length > 0 ? (
                <section>
                  <h2 className="print:hidden mb-3 text-sm font-semibold">
                    {onlyStudentId ? "Report card" : "All report cards"}
                  </h2>
                  {visibleCards.map((card) => (
                    <ReportCardSheet
                      key={card.studentId}
                      school={cardSchool}
                      exam={{
                        name: selectedExam.name,
                        date: selectedExam.date,
                        type: selectedExam.type,
                      }}
                      meta={meta}
                      card={card}
                      bands={bands}
                    />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}