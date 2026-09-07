import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { History } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  attendanceScopeWhere,
  dayRange,
  teacherAssignmentPairs,
} from "@/server/services/attendance";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { fullName } from "@/lib/students";
import { AttendanceRowActions } from "./actions";

export const metadata: Metadata = {
  title: "Attendance History",
};

const PAGE_SIZE = 25;
const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AttendanceHistoryPage(): Promise<never> {
  // Attendance is de-prioritized and blocked from the live product surface.
  notFound();
}

// The full implementation is retained (blocked but not deleted) so the
// attendance module can be re-enabled in a later phase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function AttendanceHistoryPageImpl(
  props: PageProps<"/[school]/attendance/history">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "attendance:view", { next: `/${slug}` }),
    canAccess(slug, "attendance:manage"),
  ]);

  const role = access.membership?.role;
  const isStaff = access.isPlatformStaff || role === "SCHOOL_ADMIN" || role === "TEACHER";

  const scope = await attendanceScopeWhere(access);
  const from = single(searchParams.from);
  const to = single(searchParams.to);
  const status = single(searchParams.status);
  const termId = single(searchParams.termId);
  const classId = single(searchParams.classId);
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const teacherClasses =
    role === "TEACHER" && !access.isPlatformStaff
      ? (await teacherAssignmentPairs(access)).map((p) => p.classId)
      : null;

  const childStudents =
    role === "PARENT"
      ? (
          await db.guardian.findMany({
            where: { schoolId: access.schoolId, guardianUserId: access.user.id },
            select: { studentId: true },
          })
        ).map((g) => g.studentId)
      : null;

  const fromRange = from ? dayRange(from) : null;
  const toRange = to ? dayRange(to) : null;

  const where = {
    ...scope,
    schoolId: access.schoolId,
    ...(fromRange ? { date: { gte: fromRange.start } } : {}),
    ...(toRange ? { date: { lte: toRange.end } } : {}),
    ...(isStaff && classId ? { classId } : {}),
    ...(isStaff && termId ? { termId } : {}),
    ...(status && STATUS_LABELS[status] ? { status: status as never } : {}),
    ...(role === "PARENT" ? { studentId: { in: childStudents ?? [] } } : {}),
    ...(role === "STUDENT" ? { student: { userId: access.user.id } } : {}),
  };

  const [total, records] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.findMany({
      where,
      include: {
        student: { select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        term: { select: { name: true } },
        academicYear: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: [{ date: "desc" }, { student: { lastName: "asc" } }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const key of ["from", "to", "classId", "termId", "status"] as const) {
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

  const classes = isStaff
    ? await db.class.findMany({
        where: {
          schoolId: access.schoolId,
          archived: false,
          ...(role === "TEACHER" && !access.isPlatformStaff
            ? { id: { in: teacherClasses ?? [] } }
            : {}),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance History"
        description="Filter the attendance register by date, class, term and status."
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
        </label>
        {isStaff ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Class
              <select name="classId" defaultValue={classId ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {termId ? (
              <input type="hidden" name="termId" value={termId} />
            ) : null}
          </>
        ) : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">All statuses</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="LATE">Late</option>
            <option value="EXCUSED">Excused</option>
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Filter
        </button>
        <a href={queryString({})} className="text-sm text-muted-foreground hover:text-foreground">
          Reset
        </a>
      </form>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <History className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No attendance records</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Records matching your filters will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
              {total} record{total === 1 ? "" : "s"} found
            </p>
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Student</th>
                  <th className="px-4 py-3 text-left font-medium">Class / Stream</th>
                  <th className="px-4 py-3 text-left font-medium">Term</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Note</th>
                  <th className="px-4 py-3 text-left font-medium">Recorded by</th>
                  {canManage ? (
                    <th className="px-4 py-3 text-right font-medium">Correct</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(record.date)}</td>
                    <td className="px-4 py-3 font-medium">
                      {fullName(
                        record.student.firstName,
                        record.student.middleName,
                        record.student.lastName
                      )}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {record.student.studentNo ?? ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {record.class.name}
                      {record.stream ? ` · ${record.stream.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {record.term?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          record.status === "ABSENT"
                            ? "destructive"
                            : record.status === "PRESENT"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {STATUS_LABELS[record.status]}
                      </Badge>
                    </td>
                    <td className="max-w-56 px-4 py-3 text-muted-foreground">
                      {record.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {record.recordedBy.name ?? "—"}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <AttendanceRowActions
                          slug={slug}
                          recordId={record.id}
                          currentStatus={record.status}
                          currentNote={record.note ?? ""}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, total)} of {total}
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