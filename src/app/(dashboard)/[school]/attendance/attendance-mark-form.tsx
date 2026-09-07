"use client";

import { useActionState, useRef } from "react";
import { CheckCheck, Save } from "lucide-react";

import { markAttendance } from "@/server/actions/attendance";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { success } from "@/components/ui/use-toast";
import type { AttendanceStatus } from "@/generated/prisma/client";

export type RosterRow = {
  studentId: string;
  name: string;
  studentNo: string | null;
  status: AttendanceStatus;
  note: string;
};

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
];

const selectClasses =
  "h-8 rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const noteClasses =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export function AttendanceMarkForm({
  slug,
  date,
  classId,
  streamId,
  academicYearId,
  termId,
  roster,
  existingCount,
}: {
  slug: string;
  date: string;
  classId: string;
  streamId: string | null;
  academicYearId: string;
  termId: string | null;
  roster: RosterRow[];
  existingCount: number;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof markAttendance>> | null, data: FormData) => {
      const result = await markAttendance(slug, data);
      if (result.ok) {
        const payload = result.data;
        success({
          title: "Attendance saved",
          description:
            payload && payload.updated > 0
              ? `${payload.created} added · ${payload.updated} amended (audited).`
              : `${payload ? payload.created : roster.length} record${payload && payload.created === 1 ? "" : "s"} added.`,
        });
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const tableRef = useRef<HTMLDivElement>(null);

  const markAllPresent = () => {
    if (!tableRef.current) return;
    tableRef.current
      .querySelectorAll<HTMLSelectElement>("select[name^='status[']")
      .forEach((sel) => {
        sel.value = "PRESENT";
      });
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Register — {roster.length} students</h2>
          <p className="text-xs text-muted-foreground">
            {existingCount > 0
              ? `${existingCount} record${existingCount === 1 ? "" : "s"} already saved for this day.`
              : "No attendance recorded for this day yet."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={markAllPresent}>
            <CheckCheck className="size-4" aria-hidden="true" />
            Mark all present
          </Button>
        </div>
      </div>

      <form action={formAction} noValidate>
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="streamId" value={streamId ?? ""} />
        <input type="hidden" name="academicYearId" value={academicYearId} />
        <input type="hidden" name="termId" value={termId ?? ""} />

        <div ref={tableRef} className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Student</th>
                <th className="px-4 py-3 text-left font-medium">Admission No.</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Note / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roster.map((row) => (
                <tr key={row.studentId}>
                  <td className="px-4 py-2.5 font-medium">{row.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.studentNo ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      name={`status[${row.studentId}]`}
                      defaultValue={row.status}
                      className={selectClasses}
                      aria-label={`Status for ${row.name}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      name={`note[${row.studentId}]`}
                      defaultValue={row.note}
                      placeholder="Optional note"
                      maxLength={500}
                      className={noteClasses}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {failure?.error ? (
          <p role="alert" className="px-5 pt-3 text-sm text-destructive">
            {failure.error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-border px-5 py-4">
          <Button type="submit" disabled={isPending}>
            <Save className="size-4" aria-hidden="true" />
            {isPending ? "Saving…" : "Save attendance"}
          </Button>
        </div>
      </form>
    </div>
  );
}