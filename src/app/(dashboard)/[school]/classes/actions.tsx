"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { createClass, updateClass, archiveClass } from "@/server/actions/classes";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

type ClassInfo = { id: string; name: string; archived: boolean };

export function NewClassDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createClass>> | null, data: FormData) => {
      const result = await createClass(slug, data);
      if (result.ok) success({ title: "Class created." });
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
            New class
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New class</DialogTitle>
          <DialogDescription>Create a grade level or class.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="class-name" label="Class name" required error={fe?.name?.[0]}>
            <Input id="class-name" name="name" placeholder="e.g. Grade 9" required className={inputClasses} />
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

export function EditClassDialog({
  cls,
  slug,
}: {
  cls: ClassInfo;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateClass>> | null, data: FormData) => {
      const result = await updateClass(slug, cls.id, data);
      if (result.ok) {
        success({ title: "Class updated." });
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
          <DialogTitle>Edit class</DialogTitle>
          <DialogDescription>{cls.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="class-name-edit" label="Class name" required error={fe?.name?.[0]}>
            <Input id="class-name-edit" name="name" defaultValue={cls.name} required className={inputClasses} />
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

export function ClassActions({
  cls,
  slug,
  canManage,
}: {
  cls: ClassInfo;
  slug: string;
  canManage: boolean;
}) {
  if (!canManage) return null;

  return (
    <div className="flex items-center gap-2">
      <EditClassDialog cls={cls} slug={slug} />
      {!cls.archived ? (
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
          title="Archive this class?"
          description="Archiving also archives all of its streams. Class records are kept for history."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archiveClass(slug, cls.id);
            if (!result.ok && result.error) success({ title: "Couldn’t archive", description: result.error });
          }}
        />
      ) : null}
    </div>
  );
}