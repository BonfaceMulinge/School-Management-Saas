"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createStudent } from "@/server/actions/students";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { StudentFormFields } from "./student-form-fields";

export function NewStudentDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createStudent>> | null, data: FormData) => {
      const result = await createStudent(slug, data);
      if (result.ok) success({ title: "Student created." });
      return result;
    },
    null
  );

  const failure = failureOf(state);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New student
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New student</DialogTitle>
          <DialogDescription>
            Register a student profile for this school.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <StudentFormFields fe={failure?.fieldErrors} />
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