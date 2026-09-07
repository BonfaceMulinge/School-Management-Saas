import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  attendanceRoster,
  canManageAttendanceFor,
  dayRange,
  teacherAssignmentPairs,
  todayDateString,
} from "@/server/services/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/students";
import { AttendanceMarkForm } from "./attendance-mark-form";
import type { RosterRow } from "./attendance-mark-form";

export const metadata: Metadata = {
  title: "Attendance",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AttendancePage(): Promise<never> {
  // Attendance is de-prioritized and blocked from the live product surface.
  notFound();
}

// The full implementation is retained (blocked but not deleted) so the
// attendance module can be re-enabled in a later phase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function AttendancePageImpl(
  props: PageProps<"/[school]/attendance">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "attendance:view", { next: `/${slug}` }),
    canAccess(slug, "attendance:manage"),
  ]);

  const isTeacher = access.membership?.role === "TEACHER" && !access.isPlatformStaff;
  const pairs = isTeacher ? await teacherAssignmentPairs(access) : [];
  const assignedClassIds = new Set(pairs.map((p) => p.classId));

  const [classes, years] = await Promise.all([
    db.class.findMany({
      where: {
        schoolId: access.schoolId,
        archived: false,
        ...(isTeacher ? { id: { in: [...assignedClassIds] } } : {}),
      },
      include: {
        streams: {
          where: { archived: false },
          select: { id: true, name: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const date = single(searchParams.date) || todayDateString();
  const classId = single(searchParams.classId);
  const streamId = single(searchParams.streamId);
  const academicYearId =
    single(searchParams.academicYearId) ||
    years.find((y) => y.isActive)?.id ||
    years[0]?.id;
  const termId = single(searchParams.termId);

  const selectedClass = classes.find((c) => c.id === classId);
  const allowed = classId
    ? await canManageAttendanceFor(access, classId, streamId ?? null)
    : false;

  let roster: RosterRow[] = [];
  let existingCount = 0;
  let readOnlyRoster: RosterRow[] = [];

  if (classId && academicYearId) {
    const rows = await attendanceRoster(
      access.schoolId,
      classId,
      academicYearId,
      streamId ?? null,
      termId ?? null
    );

    if (allowed) {
      const range = dayRange(date);
      const records = range
        ? await db.attendance.findMany({
            where: {
              schoolId: access.schoolId,
              date: { gte: range.start, lt: range.end },
              classId,
              ...(streamId ? { streamId } : {}),
            },
            select: { studentId: true, status: true, note: true },
          })
        : [];
      existingCount = records.length;
      const byStudent = new Map(records.map((r) => [r.studentId, r]));
      roster = rows.map((row) => ({
        studentId: row.student.id,
        name: fullName(
          row.student.firstName,
          row.student.middleName,
          row.student.lastName
        ),
        studentNo: row.student.studentNo,
        status: byStudent.get(row.student.id)?.status ?? "PRESENT",
        note: byStudent.get(row.student.id)?.note ?? "",
      }));
    } else {
      readOnlyRoster = rows.map((row) => ({
        studentId: row.student.id,
        name: fullName(
          row.student.firstName,
          row.student.middleName,
          row.student.lastName
        ),
        studentNo: row.student.studentNo,
        status: "PRESENT",
        note: "",
      }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description="Take and manage the daily register."
        action={
          canManage && classId && allowed ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <ClipboardCheck className="size-3.5 text-primary" aria-hidden="true" />
              Register open for marking
            </span>
          ) : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Date
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Class
          <select
            name="classId"
            defaultValue={classId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="" disabled>
              Select a class
            </option>
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
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
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
          Academic year
          <select
            name="academicYearId"
            defaultValue={academicYearId ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id} selected={y.id === academicYearId}>
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
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
          >
            <option value="">All terms</option>
            {years
              .find((y) => y.id === academicYearId)
              ?.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Load register
        </button>
      </form>

      {!classId ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <ClipboardCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">Select a class and date</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a class (and stream) above to see today&apos;s register.
          </p>
        </div>
      ) : !allowed ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">Register unavailable</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isTeacher
              ? "You are not assigned to this class/stream, so you cannot mark or view this register."
              : "You do not have permission to view this class register."}
          </p>
        </div>
      ) : canManage ? (
        roster.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <h3 className="text-sm font-medium">No enrolled students</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              No active enrolment for this class/stream in the selected year.
            </p>
          </div>
        ) : (
          <AttendanceMarkForm
            slug={slug}
            date={date}
            classId={classId}
            streamId={streamId ?? null}
            academicYearId={academicYearId ?? ""}
            termId={termId ?? null}
            roster={roster}
            existingCount={existingCount}
          />
        )
      ) : readOnlyRoster.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">No records yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance has not been recorded for this day and register.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Register</h2>
              <p className="text-xs text-muted-foreground">
                {readOnlyRoster.length} enrolled students
              </p>
            </div>
            <Badge variant="outline">Read-only</Badge>
          </div>
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission No.</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {readOnlyRoster.map((row) => (
                <tr key={row.studentId}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.studentNo ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    Not yet recorded
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}