"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { createSubject, updateSubject, archiveSubject } from "@/server/actions/subjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

type Subject = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  department: string | null;
  archived: boolean;
};

export function NewSubjectDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createSubject>> | null, data: FormData) => {
      const result = await createSubject(slug, data);
      if (result.ok) success({ title: "Subject created." });
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const nameError = failure?.fieldErrors?.name?.[0];
  const codeError = failure?.fieldErrors?.code?.[0];
  const deptError = failure?.fieldErrors?.department?.[0];
  const descError = failure?.fieldErrors?.description?.[0];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New subject
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New subject</DialogTitle>
          <DialogDescription>Add a subject taught by the school.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="subject-name" label="Subject name" required error={nameError}>
            <Input id="subject-name" name="name" placeholder="e.g. Mathematics" required className={inputClasses} />
          </Field>
          <Field id="subject-code" label="Code" required error={codeError} hint="Uppercase, e.g. MATH">
            <Input id="subject-code" name="code" placeholder="MATH" required className={inputClasses} />
          </Field>
          <Field id="subject-dept" label="Department" error={deptError} hint="Optional">
            <Input id="subject-dept" name="department" className={inputClasses} />
          </Field>
          <Field id="subject-desc" label="Description" error={descError} hint="Optional">
            <Textarea
              id="subject-desc"
              name="description"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            />
          </Field>
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

export function EditSubjectDialog({
  subject,
  slug,
}: {
  subject: Subject;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateSubject>> | null, data: FormData) => {
      const result = await updateSubject(slug, subject.id, data);
      if (result.ok) {
        success({ title: "Subject updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const nameError = failure?.fieldErrors?.name?.[0];
  const codeError = failure?.fieldErrors?.code?.[0];
  const deptError = failure?.fieldErrors?.department?.[0];
  const descError = failure?.fieldErrors?.description?.[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit subject</DialogTitle>
          <DialogDescription>{subject.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="subject-name-edit" label="Subject name" required error={nameError}>
            <Input id="subject-name-edit" name="name" defaultValue={subject.name} required className={inputClasses} />
          </Field>
          <Field id="subject-code-edit" label="Code" required error={codeError} hint="Uppercase, e.g. MATH">
            <Input id="subject-code-edit" name="code" defaultValue={subject.code} required className={inputClasses} />
          </Field>
          <Field id="subject-dept-edit" label="Department" error={deptError} hint="Optional">
            <Input id="subject-dept-edit" name="department" defaultValue={subject.department ?? ""} className={inputClasses} />
          </Field>
          <Field id="subject-desc-edit" label="Description" error={descError} hint="Optional">
            <Textarea
              id="subject-desc-edit"
              name="description"
              defaultValue={subject.description ?? ""}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
            />
          </Field>
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

export function SubjectActions({
  subject,
  slug,
  canManage,
}: {
  subject: Subject;
  slug: string;
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditSubjectDialog subject={subject} slug={slug} />
      {!subject.archived ? (
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
          title="Archive this subject?"
          description="Subject records are kept for history once archived."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archiveSubject(slug, subject.id);
            if (!result.ok && result.error) success({ title: "Couldn’t archive", description: result.error });
          }}
        />
      ) : null}
    </div>
  );
}