"use client";

import { useActionState } from "react";
import { useState } from "react";

import {
  archiveAcademicYear,
  setActiveAcademicYear,
  updateAcademicYear,
} from "@/server/actions/academic-years";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

type Year = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  archived: boolean;
};

export function EditYearDialog({
  year,
  slug,
}: {
  year: Year;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateAcademicYear>> | null, data: FormData) => {
      const result = await updateAcademicYear(slug, year.id, data);
      if (result.ok) {
        success({ title: "Academic year updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;
  const toDateTimeLocal = (d: Date) => {
    const p = new Date(d);
    const tp = (n: number) => String(n).padStart(2, "0");
    return `${p.getFullYear()}-${tp(p.getMonth() + 1)}-${tp(p.getDate())}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit academic year</DialogTitle>
          <DialogDescription>{year.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="year-name-edit" label="Name" required error={fe?.name?.[0]}>
            <Input
              id="year-name-edit"
              name="name"
              defaultValue={year.name}
              required
              className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="year-start-edit" label="Start date" required error={fe?.startDate?.[0]}>
              <Input
                id="year-start-edit"
                name="startDate"
                type="date"
                defaultValue={toDateTimeLocal(year.startDate)}
                required
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
              />
            </Field>
            <Field id="year-end-edit" label="End date" required error={fe?.endDate?.[0]}>
              <Input
                id="year-end-edit"
                name="endDate"
                type="date"
                defaultValue={toDateTimeLocal(year.endDate)}
                required
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
              />
            </Field>
          </div>
          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AcademicYearActions({
  year,
  slug,
  canManage,
}: {
  year: Year;
  slug: string;
  canManage: boolean;
}) {
  const [busyActive, setBusyActive] = useState(false);
  const [busyArchive, setBusyArchive] = useState(false);

  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      {!year.isActive && !year.archived ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busyActive}
          onClick={async () => {
            setBusyActive(true);
            const result = await setActiveAcademicYear(slug, year.id);
            setBusyActive(false);
            if (result.ok) success({ title: "Active year updated." });
          }}
        >
          Set active
        </Button>
      ) : null}
      <EditYearDialog year={year} slug={slug} />
      {!year.isActive && !year.archived ? (
        <ConfirmDialog
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Archive
            </Button>
          }
          title="Archive this academic year?"
          description="Archived years are kept for records but can no longer be used for new terms or enrolment."
          confirmLabel="Archive"
          destructive
          busy={busyArchive}
          onConfirm={async () => {
            setBusyArchive(true);
            const result = await archiveAcademicYear(slug, year.id);
            setBusyArchive(false);
            if (!result.ok && result.error) success({ title: "Couldn’t archive", description: result.error });
          }}
        />
      ) : null}
    </div>
  );
}