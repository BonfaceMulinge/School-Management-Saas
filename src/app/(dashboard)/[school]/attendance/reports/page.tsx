import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BarChart3, FileDown } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { attendanceScopeWhere, dayRange, todayDateString } from "@/server/services/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/students";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Attendance Reports",
};

const STUDENT_PAGE_SIZE = 20;
const STATUS_ORDER = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function statusCounts(
  rows: { status: string; count: number }[]
): Record<string, number> {
  const out: Record<string, number> = {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  };
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + r.count;
  return out;
}

export default async function AttendanceReportsPage(): Promise<never> {
  // Attendance is de-prioritized and blocked from the live product surface.
  notFound();
}

// The full implementation is retained (blocked but not deleted) so the
// attendance module can be re-enabled in a later phase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function AttendanceReportsPageImpl(
  props: PageProps<"/[school]/attendance/reports">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "attendance:report", {
    next: `/${slug}`,
  });

  const scope = await attendanceScopeWhere(access);

  const years = await db.academicYear.findMany({
    where: { schoolId: access.schoolId, archived: false },
    include: { terms: { select: { id: true, name: true } } },
    orderBy: { startDate: "desc" },
  });

  const classes = await db.class.findMany({
    where: { schoolId: access.schoolId, archived: false },
    include: {
      streams: { where: { archived: false }, select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const today = todayDateString();
  const yearId =
    single(searchParams.yearId) ||
    years.find((y) => y.isActive)?.id ||
    years[0]?.id;
  const termId = single(searchParams.termId);
  const date = single(searchParams.date) || today;
  const from = single(searchParams.from) || date;
  const to = single(searchParams.to) || date;
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const reportStudentId = single(searchParams.studentId);
  const q = single(searchParams.q);
  const studentPage = Math.max(1, Number(single(searchParams.page)) || 1);

  const range = dayRange(date);
  const fromRange = dayRange(from);
  const toRange = dayRange(to);

  const countOf = (c: unknown) =>
    typeof c === "object" && c !== null
      ? ((c as { _all?: number })._all ?? 0)
      : 0;

  // --- Daily summary for the selected date --------------------------------
  const dailyRows = range
    ? await db.attendance.groupBy({
        by: ["status"],
        where: {
          ...scope,
          schoolId: access.schoolId,
          date: { gte: range.start, lt: range.end },
        },
        _count: { _all: true },
      })
    : [];
  const dailyCounts = statusCounts(
    dailyRows.map((r) => ({ status: r.status, count: countOf(r._count) }))
  );
  const dailyTotal = STATUS_ORDER.reduce((sum, s) => sum + dailyCounts[s], 0);

  // --- Attendance by class for the report date ----------------------------
  const classGrouped = range
    ? await db.attendance.groupBy({
        by: ["classId", "status"],
        where: {
          ...scope,
          schoolId: access.schoolId,
          date: { gte: range.start, lt: range.end },
        },
        _count: { _all: true },
      })
    : [];
  const perClass: Record<
    string,
    { statuses: Record<string, number>; total: number }
  > = {};
  for (const row of classGrouped) {
    const existingEntry = perClass[row.classId];
    const entry = existingEntry ?? { statuses: {}, total: 0 };
    entry.statuses[row.status] = (entry.statuses[row.status] ?? 0) + countOf(row._count);
    entry.total += countOf(row._count);
    perClass[row.classId] = entry;
  }

  const rosterByClass = await db.enrollment.groupBy({
    by: ["classId"],
    where: {
      schoolId: access.schoolId,
      academicYearId: yearId,
      status: "ACTIVE",
      ...(termId ? { termId } : {}),
      student: { archived: false },
    },
    _count: { _all: true },
  });
  const rosterSize = new Map(
    rosterByClass.map((r) => [r.classId, countOf(r._count)])
  );

  // --- Absenteeism trend: last 14 days ending at the report date ----------
  const trendStart = range
    ? new Date(range.start.getTime() - 13 * 86400000)
    : new Date();
  const trendWhere = range
    ? { ...scope, schoolId: access.schoolId, date: { gte: trendStart, lt: range.end } }
    : { ...scope, schoolId: access.schoolId };
  const trendGrouped = await db.attendance.groupBy({
    by: ["date", "status"],
    where: trendWhere,
    _count: { _all: true },
  });
  const trendByDate = new Map<string, Record<string, number>>();
  for (const row of trendGrouped) {
    const key = row.date.toISOString().slice(0, 10);
    const existing = trendByDate.get(key);
    const entry = existing ?? {};
    entry[row.status] = countOf(row._count);
    trendByDate.set(key, entry);
  }
  const trendDays: { date: string; counts: Record<string, number> }[] = [];
  if (range) {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(range.start.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const counts = trendByDate.get(key) ?? {};
      trendDays.push({ date: key, counts });
    }
  }

  // --- Student attendance history -----------------------------------------
  const studentWhere = {
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

  const [studentTotal, students] = await Promise.all([
    db.student.count({ where: studentWhere }),
    db.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        studentNo: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (studentPage - 1) * STUDENT_PAGE_SIZE,
      take: STUDENT_PAGE_SIZE,
    }),
  ]);

  const studentHistoryRows: {
    id: string;
    date: Date;
    status: string;
    note: string | null;
    class: { name: string } | null;
    stream: { name: string } | null;
    term: { name: string } | null;
    recordedBy: { name: string | null } | null;
    changes: { id: string }[];
  }[] = [];
  let studentHistoryCounts: Record<string, number> = {
    PRESENT: 0,
    ABSENT: 0,
    LATE: 0,
    EXCUSED: 0,
  };
  let studentHistoryTotal = 0;

  if (reportStudentId) {
    const historyWhere = {
      ...scope,
      schoolId: access.schoolId,
      studentId: reportStudentId,
      ...(fromRange ? { date: { gte: fromRange.start } } : {}),
      ...(toRange ? { date: { lte: toRange.end } } : {}),
    };
    const [history, historyGrouped] = await Promise.all([
      db.attendance.findMany({
        where: historyWhere,
        select: {
          id: true,
          date: true,
          status: true,
          note: true,
          class: { select: { name: true } },
          stream: { select: { name: true } },
          term: { select: { name: true } },
          recordedBy: { select: { name: true } },
          changes: { select: { id: true } },
        },
        orderBy: { date: "desc" },
        take: 200,
      }),
      db.attendance.groupBy({
        by: ["status"],
        where: historyWhere,
        _count: { _all: true },
      }),
    ]);
    studentHistoryRows.push(...history);
    studentHistoryCounts = statusCounts(
      historyGrouped.map((r) => ({ status: r.status, count: countOf(r._count) }))
    );
    studentHistoryTotal = historyGrouped.reduce(
      (sum, r) => sum + countOf(r._count),
      0
    );
  }

  const studentTotalPages = Math.max(
    1,
    Math.ceil(studentTotal / STUDENT_PAGE_SIZE)
  );
  const safeStudentPage = Math.min(studentPage, studentTotalPages);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const key of [
      "yearId",
      "termId",
      "date",
      "from",
      "to",
      "classId",
      "streamId",
      "studentId",
      "q",
    ] as const) {
      const v = single({ [key]: searchParams[key] }[key]);
      if (v) params.set(key, v);
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Attendance Reports"
        description="Daily, class and student attendance analytics with absenteeism trends."
        action={
          <button
            type="button"
            disabled
            title="PDF / CSV export arrives in a later phase."
            className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60"
          >
            <FileDown className="size-4" aria-hidden="true" />
            Export
          </button>
        }
      />

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Academic year
          <select
            name="yearId"
            defaultValue={yearId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
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
          Report date
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
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
            {classes
              .find((c) => c.id === classId)
              ?.streams.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Run report
        </button>
      </form>

      {/* Daily summary */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Daily summary — {formatDate(new Date(date + "T00:00:00"))}</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
              <p className="mt-1 text-2xl font-semibold">{dailyCounts[s]}</p>
            </div>
          ))}
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold">{dailyTotal}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Attendance %</p>
            <p className="mt-1 text-2xl font-semibold">{pct(dailyCounts.PRESENT, dailyTotal)}</p>
          </div>
        </div>
      </section>

      {/* Class attendance */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Class attendance — {formatDate(new Date(date + "T00:00:00"))}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Class</th>
                <th className="px-4 py-3 text-center font-medium">Enrolled</th>
                <th className="px-4 py-3 text-center font-medium">Present</th>
                <th className="px-4 py-3 text-center font-medium">Absent</th>
                <th className="px-4 py-3 text-center font-medium">Late</th>
                <th className="px-4 py-3 text-center font-medium">Excused</th>
                <th className="px-4 py-3 text-center font-medium">Attendance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classes.map((c) => {
                const entry = perClass[c.id];
                const enrolled = rosterSize.get(c.id) ?? 0;
                const statuses = entry?.statuses ?? {};
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{enrolled}</td>
                    <td className="px-4 py-3 text-center">{statuses.PRESENT ?? 0}</td>
                    <td className="px-4 py-3 text-center text-destructive">{statuses.ABSENT ?? 0}</td>
                    <td className="px-4 py-3 text-center">{statuses.LATE ?? 0}</td>
                    <td className="px-4 py-3 text-center">{statuses.EXCUSED ?? 0}</td>
                    <td className="px-4 py-3 text-center font-medium">
                      {enrolled > 0 ? pct(statuses.PRESENT ?? 0, enrolled) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {classes.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No classes yet.</p>
        ) : null}
      </section>

      {/* Absenteeism trend */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Absenteeism trend — last 14 days</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-center font-medium">Present</th>
                <th className="px-4 py-3 text-center font-medium">Absent</th>
                <th className="px-4 py-3 text-center font-medium">Late</th>
                <th className="px-4 py-3 text-center font-medium">Excused</th>
                <th className="px-4 py-3 text-center font-medium">Absenteeism %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {trendDays.map((day) => {
                const total =
                  (day.counts.PRESENT ?? 0) +
                  (day.counts.ABSENT ?? 0) +
                  (day.counts.LATE ?? 0) +
                  (day.counts.EXCUSED ?? 0);
                return (
                  <tr key={day.date}>
                    <td className="px-4 py-2.5 font-medium">{day.date}</td>
                    <td className="px-4 py-2.5 text-center">{day.counts.PRESENT ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center text-destructive">
                      <Badge variant={day.counts.ABSENT ? "destructive" : "outline"}>
                        {day.counts.ABSENT ?? 0}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-center">{day.counts.LATE ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">{day.counts.EXCUSED ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center">{pct(day.counts.ABSENT ?? 0, total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Student attendance history */}
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">Student attendance history</h3>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="yearId" value={yearId ?? ""} />
            <input type="hidden" name="termId" value={termId ?? ""} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <input type="hidden" name="classId" value={classId ?? ""} />
            <input type="hidden" name="streamId" value={streamId ?? ""} />
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search students…"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            />
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Search
            </button>
          </form>
        </div>

        <div className="divide-y divide-border">
          {students.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {fullName(s.firstName, s.middleName, s.lastName)}
                </p>
                <p className="text-xs text-muted-foreground">{s.studentNo ?? "—"}</p>
              </div>
              <a
                href={queryString({ studentId: s.id })}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  reportStudentId === s.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                View history
              </a>
            </div>
          ))}
        </div>

        {studentTotal === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No students match your search.
          </p>
        ) : null}

        {studentTotal > STUDENT_PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
            <p>
              Showing {(safeStudentPage - 1) * STUDENT_PAGE_SIZE + 1}–
              {Math.min(safeStudentPage * STUDENT_PAGE_SIZE, studentTotal)} of {studentTotal}
            </p>
            <div className="flex items-center gap-2">
              <a
                href={queryString({ page: String(safeStudentPage - 1), studentId: reportStudentId ?? "" })}
                className={safeStudentPage <= 1 ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50" : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Previous
              </a>
              <span>
                Page {safeStudentPage} of {studentTotalPages}
              </span>
              <a
                href={queryString({ page: String(safeStudentPage + 1), studentId: reportStudentId ?? "" })}
                className={safeStudentPage >= studentTotalPages ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50" : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Next
              </a>
            </div>
          </div>
        ) : null}

        {reportStudentId && studentHistoryTotal === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No attendance records for this range.
          </p>
        ) : null}

        {reportStudentId && studentHistoryTotal > 0 ? (
          <div className="border-t border-border">
            <div className="grid grid-cols-2 gap-2 border-b border-border px-5 py-4 sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <p className="text-xs text-muted-foreground">Total days</p>
                <p className="text-lg font-semibold">{studentHistoryTotal}</p>
              </div>
              {STATUS_ORDER.map((s) => (
                <div key={s}>
                  <p className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</p>
                  <p className="text-lg font-semibold">{studentHistoryCounts[s]}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-muted-foreground">Attendance %</p>
                <p className="text-lg font-semibold">
                  {pct(studentHistoryCounts.PRESENT, studentHistoryTotal)}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                    <th className="px-4 py-3 text-left font-medium">Term</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Note</th>
                    <th className="px-4 py-3 text-left font-medium">Recorded by</th>
                    <th className="px-4 py-3 text-center font-medium">Corrections</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {studentHistoryRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.class?.name ?? "—"}
                        {row.stream ? ` · ${row.stream.name}` : ""}
                      </td>
                      <td className="px-4 py-2.5">{row.term?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            row.status === "ABSENT"
                              ? "destructive"
                              : row.status === "PRESENT"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </td>
                      <td className="max-w-48 px-4 py-2.5 text-muted-foreground">
                        {row.note ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {row.recordedBy?.name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={row.changes.length > 0 ? "secondary" : "outline"}>
                          {row.changes.length}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-muted-foreground">
              <BarChart3 className="mr-1 inline size-3.5" aria-hidden="true" />
              Preparing report data for PDF/CSV export (coming in a later phase).
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}