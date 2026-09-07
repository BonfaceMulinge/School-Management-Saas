"use client";

import { useActionState, useState } from "react";

import {
  archiveTerm,
  setActiveTerm,
  updateTerm,
} from "@/server/actions/terms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";
import type { YearOption } from "./new-term-dialog";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

function yearItems(years: YearOption[]) {
  return Object.fromEntries(years.map((y) => [y.id, y.name]));
}

type Term = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  archived: boolean;
  academicYearId: string;
  academicYear: { name: string };
};

function toDateInput(d: Date) {
  const p = new Date(d);
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${p.getFullYear()}-${tp(p.getMonth() + 1)}-${tp(p.getDate())}`;
}

export function EditTermDialog({
  term,
  slug,
  years,
}: {
  term: Term;
  slug: string;
  years: YearOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateTerm>> | null, data: FormData) => {
      const result = await updateTerm(slug, term.id, data);
      if (result.ok) {
        success({ title: "Term updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit term</DialogTitle>
          <DialogDescription>{term.academicYear.name} · {term.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="term-year-edit" label="Academic year" required error={fe?.academicYearId?.[0]}>
            <Select
              name="academicYearId"
              defaultValue={term.academicYearId}
              items={yearItems(years)}
            >
              <SelectTrigger className="w-full" aria-label="Academic year">
                <SelectValue placeholder="Select academic year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="term-name-edit" label="Term name" required error={fe?.name?.[0]}>
            <Input id="term-name-edit" name="name" defaultValue={term.name} required className={inputClasses} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="term-start-edit" label="Start date" required error={fe?.startDate?.[0]}>
              <Input id="term-start-edit" name="startDate" type="date" defaultValue={toDateInput(term.startDate)} required className={inputClasses} />
            </Field>
            <Field id="term-end-edit" label="End date" required error={fe?.endDate?.[0]}>
              <Input id="term-end-edit" name="endDate" type="date" defaultValue={toDateInput(term.endDate)} required className={inputClasses} />
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

export function TermActions({
  term,
  slug,
  years,
  canManage,
}: {
  term: Term;
  slug: string;
  years: YearOption[];
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      {!term.isActive && !term.archived ? (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const result = await setActiveTerm(slug, term.id);
            if (result.ok) success({ title: "Active term updated." });
          }}
        >
          Set active
        </Button>
      ) : null}
      <EditTermDialog term={term} slug={slug} years={years} />
      {!term.isActive && !term.archived ? (
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
          title="Archive this term?"
          description="Archived terms are kept for records but no longer used for new enrolment."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archiveTerm(slug, term.id);
            if (!result.ok && result.error) success({ title: "Couldn’t archive", description: result.error });
          }}
        />
      ) : null}
    </div>
  );
}