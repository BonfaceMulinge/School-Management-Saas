"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createTerm } from "@/server/actions/terms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type YearOption = { id: string; name: string };

function yearItems(years: YearOption[]) {
  return Object.fromEntries(years.map((y) => [y.id, y.name]));
}

export function NewTermDialog({
  slug,
  years,
}: {
  slug: string;
  years: YearOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createTerm>> | null, data: FormData) => {
      const result = await createTerm(slug, data);
      if (result.ok) success({ title: "Term created." });
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New term
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New term</DialogTitle>
          <DialogDescription>Add a term to an academic year.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="term-year" label="Academic year" required error={fe?.academicYearId?.[0]}>
            <Select
              name="academicYearId"
              defaultValue={years[0]?.id}
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
          <Field id="term-name" label="Term name" required error={fe?.name?.[0]}>
            <Input id="term-name" name="name" placeholder="e.g. Term 1" required className={inputClasses} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="term-start-new" label="Start date" required error={fe?.startDate?.[0]}>
              <Input id="term-start-new" name="startDate" type="date" required className={inputClasses} />
            </Field>
            <Field id="term-end-new" label="End date" required error={fe?.endDate?.[0]}>
              <Input id="term-end-new" name="endDate" type="date" required className={inputClasses} />
            </Field>
          </div>
          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}