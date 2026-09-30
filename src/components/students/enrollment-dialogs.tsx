"use client";

import { useActionState, useState } from "react";

import {
  enrollStudent,
  transferStudent,
  promoteStudent,
  updateEnrollmentStatus,
} from "@/server/actions/enrollments";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";

export type RefClass = {
  id: string;
  name: string;
  streams: { id: string; name: string }[];
};

export type RefYear = {
  id: string;
  name: string;
  terms: { id: string; name: string }[];
};

export type RefPathway = { id: string; name: string };

export type RefCombination = { id: string; name: string; code: string | null };

export const enrollmentSelectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export function EnrollmentFields({
  classes,
  years,
  pathways,
  combinations,
  defaultClassId,
  defaultYearId,
  fe,
}: {
  classes: RefClass[];
  years: RefYear[];
  pathways?: RefPathway[];
  combinations?: RefCombination[];
  defaultClassId?: string;
  defaultYearId?: string;
  fe: Record<string, string[]> | undefined;
}) {
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [yearId, setYearId] = useState(defaultYearId ?? "");

  const streams = classes.find((c) => c.id === classId)?.streams ?? [];
  const terms = years.find((y) => y.id === yearId)?.terms ?? [];

  return (
    <div className="grid gap-4">
      <Field id="en-class" label="Class" required error={fe?.classId?.[0]}>
        <select
          id="en-class"
          name="classId"
          required
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={enrollmentSelectClasses}
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
      </Field>
      <Field id="en-stream" label="Stream" error={fe?.streamId?.[0]}>
        <select id="en-stream" name="streamId" className={enrollmentSelectClasses}>
          <option value="">No stream</option>
          {streams.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="en-year" label="Academic year" required error={fe?.academicYearId?.[0]}>
        <select
          id="en-year"
          name="academicYearId"
          required
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className={enrollmentSelectClasses}
        >
          <option value="" disabled>
            Select a year
          </option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="en-term" label="Term" error={fe?.termId?.[0]}>
        <select id="en-term" name="termId" className={enrollmentSelectClasses}>
          <option value="">No term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      {pathways && pathways.length > 0 ? (
        <Field id="en-pathway" label="Senior School pathway" error={fe?.pathwayId?.[0]}>
          <select id="en-pathway" name="pathwayId" className={enrollmentSelectClasses}>
            <option value="">Not applicable</option>
            {pathways.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {combinations && combinations.length > 0 ? (
        <Field id="en-combination" label="Subject combination" error={fe?.combinationId?.[0]}>
          <select id="en-combination" name="combinationId" className={enrollmentSelectClasses}>
            <option value="">Not applicable</option>
            {combinations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}

export function EnrollDialog({
  slug,
  studentId,
  studentName,
  hasActiveEnrollment,
  classes,
  years,
  pathways,
  combinations,
}: {
  slug: string;
  studentId: string;
  studentName: string;
  hasActiveEnrollment: boolean;
  classes: RefClass[];
  years: RefYear[];
  pathways?: RefPathway[];
  combinations?: RefCombination[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof enrollStudent>> | null, data: FormData) => {
      data.set("slug", slug);
      const result = await enrollStudent(slug, data);
      if (result.ok) {
        success({ title: "Student enrolled." });
        setOpen(false);
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <div>
      <Button size="sm" onClick={() => setOpen(true)} disabled={hasActiveEnrollment}>
        Enroll
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enrol {studentName}</DialogTitle>
            <DialogDescription>
              Create a new enrolment record for a fresh academic year.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="grid gap-4">
<input type="hidden" name="studentId" value={studentId} />
            <EnrollmentFields
              classes={classes}
              years={years}
              pathways={pathways}
              combinations={combinations}
              fe={failure?.fieldErrors}
            />
            {failure?.error && !failure.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">{failure.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Enrolling…" : "Enroll"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TransferDialog({
  slug,
  studentId,
  studentName,
  classes,
  years,
  pathways,
  combinations,
}: {
  slug: string;
  studentId: string;
  studentName: string;
  classes: RefClass[];
  years: RefYear[];
  pathways?: RefPathway[];
  combinations?: RefCombination[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof transferStudent>> | null, data: FormData) => {
      const result = await transferStudent(slug, data);
      if (result.ok) {
        success({ title: "Student transferred." });
        setOpen(false);
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Transfer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer {studentName}</DialogTitle>
            <DialogDescription>
              Move the student to a new class/stream. Their current active
              enrolment is closed and kept as history.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="grid gap-4">
<input type="hidden" name="studentId" value={studentId} />
            <EnrollmentFields
              classes={classes}
              years={years}
              pathways={pathways}
              combinations={combinations}
              fe={failure?.fieldErrors}
            />
            {failure?.error && !failure.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">{failure.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Transferring…" : "Transfer"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PromoteDialog({
  slug,
  studentId,
  studentName,
  classes,
  years,
  pathways,
  combinations,
}: {
  slug: string;
  studentId: string;
  studentName: string;
  classes: RefClass[];
  years: RefYear[];
  pathways?: RefPathway[];
  combinations?: RefCombination[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof promoteStudent>> | null, data: FormData) => {
      const result = await promoteStudent(slug, data);
      if (result.ok) {
        success({ title: "Student promoted." });
        setOpen(false);
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Promote
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote {studentName}</DialogTitle>
            <DialogDescription>
              Advance the student to a new academic year. Enrolments from
              completed years are marked as graduated.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="grid gap-4">
<input type="hidden" name="studentId" value={studentId} />
            <EnrollmentFields
              classes={classes}
              years={years}
              pathways={pathways}
              combinations={combinations}
              fe={failure?.fieldErrors}
            />
            {failure?.error && !failure.fieldErrors ? (
              <p role="alert" className="text-sm text-destructive">{failure.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Promoting…" : "Promote"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  DROPPED: "Dropped",
};

export function EnrollmentStatusPicker({
  slug,
  enrollmentId,
  current,
}: {
  slug: string;
  enrollmentId: string;
  current: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <select
      aria-label="Enrollment status"
      value={current}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        const result = await updateEnrollmentStatus(slug, enrollmentId, e.target.value);
        setBusy(false);
        if (result.ok) success({ title: "Enrollment status updated." });
      }}
      className="h-8 rounded-md border border-border bg-background px-2 py-1 text-xs shadow-xs focus-visible:border-ring focus-visible:outline-none"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
