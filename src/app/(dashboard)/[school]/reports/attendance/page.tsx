import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, Info } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { studentsScopeWhere } from "@/server/services/students";
import {
  dailyAttendanceReport,
  attendanceSummary,
  studentAttendanceHistory,
  classStreamAttendanceReport,
  absenceLateReport,
} from "@/server/services/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CsvExportButton, PrintButton } from "@/components/ui/export-buttons";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";

export const metadata: Metadata = {
  title: "Attendance reports",
};

const TABS = [
  { value: "daily", label: "Daily register" },
  { value: "history", label: "Student history" },
  { value: "class-stream", label: "Class / stream" },
  { value: "absence", label: "Absences & late" },
  { value: "summary", label: "Summary" },
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

const STATUS_ORDER: Record<string, number> = { PRESENT: 0, LATE: 1, ABSENT: 2, EXCUSED: 3 };

export default async function AttendanceReportsPage(): Promise<never> {
  // Attendance is de-prioritized and blocked from the live product surface.
  notFound();
}

// The full implementation is retained (blocked but not deleted) so the
// attendance module can be re-enabled in a later phase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function AttendanceReportsPageImpl(
  props: PageProps<"/[school]/reports/attendance">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "attendance:view", { next: `/${slug}` });

  const view: View = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as View)
    : "daily";

  const date = single(searchParams.date) ?? "";
  const from = single(searchParams.from);
  const to = single(searchParams.to);
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const studentId = single(searchParams.studentId);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const [classes, scopedStudents] = await Promise.all([
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { streams: { select: { id: true, name: true } } },
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
      href: `/${slug}/reports/attendance?view=${t.value}`,
      active: t.value === active,
    }));

  function stateLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }

  const filterBar = (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
      <input type="hidden" name="view" value={view} />
      {view === "daily" ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Date
          <input
            name="date"
            type="date"
            defaultValue={date}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
      ) : view === "history" ? (
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
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </>
      ) : (
        <>
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
          {view === "class-stream" || view === "absence" || view === "summary" ? (
            <>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                From
                <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                To
                <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              </label>
            </>
          ) : null}
        </>
      )}
      <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Apply
      </button>
      <a
        href={`/${slug}/reports/attendance?view=${view}`}
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

  if (view === "daily") {
    const report = await dailyAttendanceReport(access, { date, classId, streamId });
    const sorted = Object.entries(report.counts).sort((a, b) => (STATUS_ORDER[a[0]] ?? 9) - (STATUS_ORDER[b[0]] ?? 9));
    csv = {
      headers: ["Student", "Admission no.", "Class", "Stream", "Status"],
      rows: report.rows.map((r) => [String(r.studentName), String(r.studentNo ?? ""), String(r.className), String(r.streamName), String(r.status)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((s) => (
            <div key={s} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{stateLabel(s)}</p>
              <p className="mt-1 text-2xl font-semibold">{report.counts[s] ?? 0}</p>
            </div>
          ))}
        </div>
        {sorted.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Registered on {report.date} · {report.rows.length} record(s).
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">{r.studentName}</td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3">{r.status}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No attendance recorded for this day in your scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (view === "history") {
    const report = studentId
      ? await studentAttendanceHistory(access, studentId, { from, to })
      : null;
    const student = scopedStudents.find((s) => s.id === studentId);
    csv = report
      ? {
          headers: ["Status", "Days"],
          rows: Object.entries(report.counts).map(([k, v]) => [`${k.charAt(0)}${k.slice(1).toLowerCase()}`, String(v)]),
        }
      : null;
    content = report ? (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((s) => (
            <div key={s} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{stateLabel(s)}</p>
              <p className="mt-1 text-2xl font-semibold">{report.counts[s] ?? 0}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <tbody className="divide-y divide-border bg-card">
              {[
                ["Days recorded", String(report.total)],
                ["Attendance rate (present + late)", `${report.percentage ?? "—"}%`],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="px-4 py-3 text-muted-foreground">{label}</td>
                  <td className="px-4 py-3 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <CalendarCheck2 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-medium">
          {student ? "Loading history" : "Choose a student"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {student
            ? fullName(student.firstName, student.middleName, student.lastName)
            : "Select a student above to view their attendance history."}
        </p>
      </div>
    );
  } else if (view === "class-stream") {
    const report = await classStreamAttendanceReport(access, { classId, streamId, from, to });
    csv = {
      headers: ["Student", "Admission no.", "Class / Stream", "Present", "Late", "Absent", "Excused", "Days", "Rate %"],
      rows: report.rows.map((r) => [
        r.studentName,
        r.studentNo ?? "",
        `${r.className} / ${r.streamName}`,
        String(r.counts.PRESENT ?? 0),
        String(r.counts.LATE ?? 0),
        String(r.counts.ABSENT ?? 0),
        String(r.counts.EXCUSED ?? 0),
        String(r.total),
        String(r.percentage ?? ""),
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {from ? `From ${formatDate(new Date(`${from}T00:00:00Z`))} ` : ""}
          {to ? `to ${formatDate(new Date(`${to}T00:00:00Z`))} ` : ""}
          · {report.rows.length} student(s) in scope.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-right font-medium">Present</th>
                <th className="px-4 py-3 text-right font-medium">Late</th>
                <th className="px-4 py-3 text-right font-medium">Absent</th>
                <th className="px-4 py-3 text-right font-medium">Excused</th>
                <th className="px-4 py-3 text-right font-medium">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="px-4 py-3 font-medium">{r.studentName}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-right">{r.counts.PRESENT ?? 0}</td>
                  <td className="px-4 py-3 text-right">{r.counts.LATE ?? 0}</td>
                  <td className="px-4 py-3 text-right">{r.counts.ABSENT ?? 0}</td>
                  <td className="px-4 py-3 text-right">{r.counts.EXCUSED ?? 0}</td>
                  <td className="px-4 py-3 text-right font-medium">{r.percentage ?? "—"}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No attendance records in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (view === "absence") {
    const report = await absenceLateReport(access, { classId, streamId, from, to, page, take: 100 });
    csv = {
      headers: ["Student", "Admission no.", "Class / Stream", "Date", "Status"],
      rows: report.rows.map((r) => [String(r.studentName), String(r.studentNo ?? ""), String(`${r.className} / ${r.streamName}`), String(formatDate(r.date)), String(r.status)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission no.</th>
                <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.studentName}</td>
                  <td className="px-4 py-3">{r.studentNo ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.className}
                    {r.streamName !== "—" ? ` / ${r.streamName}` : ""}
                  </td>
                  <td className="px-4 py-3">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">{r.status}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No absences or late arrivals in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {report.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {report.page} of {report.totalPages} · {report.total} record(s)
            </span>
            <div className="flex items-center gap-2">
              {report.page > 1 ? (
                <a
                  href={`/${slug}/reports/attendance?${qs({ view, classId, streamId, from, to, page: String(report.page - 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Previous
                </a>
              ) : null}
              {report.page < report.totalPages ? (
                <a
                  href={`/${slug}/reports/attendance?${qs({ view, classId, streamId, from, to, page: String(report.page + 1) })}`}
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
  } else {
    const report = await attendanceSummary(access, { classId, streamId, from, to });
    csv = {
      headers: ["Status", "Days", "Share %"],
      rows: Object.entries(report.counts)
        .sort((a, b) => (STATUS_ORDER[a[0]] ?? 9) - (STATUS_ORDER[b[0]] ?? 9))
        .map(([k, v]) => [
          String(stateLabel(k)),
          String(v),
          String(report.total > 0 ? Math.round((v / report.total) * 1000) / 10 : "0"),
        ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {["PRESENT", "LATE", "ABSENT", "EXCUSED"].map((s) => (
            <div key={s} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{stateLabel(s)}</p>
              <p className="mt-1 text-2xl font-semibold">{report.counts[s] ?? 0}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <tbody className="divide-y divide-border bg-card">
              {[
                ["Total records", String(report.total)],
                ["Attendance rate (present + late)", `${report.percentage ?? "—"}%`],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="px-4 py-3 text-muted-foreground">{label}</td>
                  <td className="px-4 py-3 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const reportTitle =
    view === "daily"
      ? "Daily attendance register"
      : view === "history"
        ? "Student attendance history"
        : view === "class-stream"
          ? "Class / stream attendance"
          : view === "absence"
            ? "Absences & late arrivals"
            : "Attendance summary";

  return (
    <div className="flex flex-col gap-6">
      {printHeader(reportTitle)}
      <div className="print:hidden">
        <PageHeader
          title="Attendance reports"
          description="Daily registers, histories, class summaries and absence activity."
          action={
            <div className="flex items-center gap-2">
              <PrintButton />
              {csv ? (
                <CsvExportButton
                  filename={`attendance-${view}.csv`}
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

      {filterBar}
      {content}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
        <Info className="mt-0.5 size-3.5" aria-hidden="true" />
        Attendance scoping applies: parents see linked children, students their own records and
        teachers only their assigned classes.
      </p>
    </div>
  );
}