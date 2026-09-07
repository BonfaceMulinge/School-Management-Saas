"use client";

import { useActionState, useState } from "react";

import { updateAttendanceRecord } from "@/server/actions/attendance";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import type { AttendanceStatus } from "@/generated/prisma/client";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
  { value: "EXCUSED", label: "Excused" },
];

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export function AttendanceRowActions({
  slug,
  recordId,
  currentStatus,
  currentNote,
}: {
  slug: string;
  recordId: string;
  currentStatus: AttendanceStatus;
  currentNote: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateAttendanceRecord>> | null, data: FormData) => {
      const result = await updateAttendanceRecord(slug, recordId, data);
      if (result.ok) {
        success({ title: "Record corrected" });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Correct
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct attendance record</DialogTitle>
            <DialogDescription>
              Corrections are audited and saved to the record&apos;s history.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="grid gap-4">
            <Field id="fix-status" label="Status" error={fe?.status?.[0]}>
              <select
                id="fix-status"
                name="status"
                defaultValue={currentStatus}
                className={selectClasses}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="fix-note" label="Note" error={fe?.note?.[0]}>
              <Input
                id="fix-note"
                name="note"
                defaultValue={currentNote}
                placeholder="Optional note"
                maxLength={500}
                className={inputClasses}
              />
            </Field>
            <Field id="fix-reason" label="Reason" error={fe?.reason?.[0]}>
              <Input
                id="fix-reason"
                name="reason"
                placeholder="Required when changing the status"
                className={inputClasses}
              />
            </Field>
            {failure?.error && !failure.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">{failure.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save correction"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}