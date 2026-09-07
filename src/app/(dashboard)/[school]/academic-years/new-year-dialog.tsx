"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createAcademicYear } from "@/server/actions/academic-years";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";

function inputClasses() {
  return [
    "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors",
    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
  ].join(" ");
}

export function NewAcademicYearDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createAcademicYear>> | null, data: FormData) => {
      const result = await createAcademicYear(slug, data);
      if (result.ok) success({ title: "Academic year created." });
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
            New academic year
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New academic year</DialogTitle>
          <DialogDescription>
            Create an academic year to structure terms and enrolment.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="year-name" label="Name" required error={fe?.name?.[0]}>
            <Input
              id="year-name"
              name="name"
              placeholder="e.g. 2025 / 2026"
              required
              className={inputClasses()}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="year-start" label="Start date" required error={fe?.startDate?.[0]}>
              <Input
                id="year-start"
                name="startDate"
                type="date"
                required
                className={inputClasses()}
              />
            </Field>
            <Field id="year-end" label="End date" required error={fe?.endDate?.[0]}>
              <Input
                id="year-end"
                name="endDate"
                type="date"
                required
                className={inputClasses()}
              />
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