"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import { createStream, updateStream, archiveStream } from "@/server/actions/streams";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

function classItems(classes: ClassOption[]) {
  return Object.fromEntries(classes.map((c) => [c.id, c.name]));
}

export type ClassOption = { id: string; name: string };
type Stream = {
  id: string;
  name: string;
  archived: boolean;
  classId: string;
  class: { name: string };
};

export function NewStreamDialog({
  slug,
  classes,
}: {
  slug: string;
  classes: ClassOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createStream>> | null, data: FormData) => {
      const result = await createStream(slug, data);
      if (result.ok) success({ title: "Stream created." });
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
            New stream
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New stream</DialogTitle>
          <DialogDescription>Add a stream to a class.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="stream-class" label="Class" required error={fe?.classId?.[0]}>
            <Select name="classId" defaultValue={classes[0]?.id} items={classItems(classes)}>
              <SelectTrigger className="w-full" aria-label="Class">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="stream-name" label="Stream name" required error={fe?.name?.[0]}>
            <Input id="stream-name" name="name" placeholder="e.g. East" required className={inputClasses} />
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

export function EditStreamDialog({
  stream,
  slug,
  classes,
}: {
  stream: Stream;
  slug: string;
  classes: ClassOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateStream>> | null, data: FormData) => {
      const result = await updateStream(slug, stream.id, data);
      if (result.ok) {
        success({ title: "Stream updated." });
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
          <DialogTitle>Edit stream</DialogTitle>
          <DialogDescription>{stream.class.name} · {stream.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="stream-class-edit" label="Class" required error={fe?.classId?.[0]}>
            <Select name="classId" defaultValue={stream.classId} items={classItems(classes)}>
              <SelectTrigger className="w-full" aria-label="Class">
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="stream-name-edit" label="Stream name" required error={fe?.name?.[0]}>
            <Input id="stream-name-edit" name="name" defaultValue={stream.name} required className={inputClasses} />
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

export function StreamActions({
  stream,
  slug,
  classes,
  canManage,
}: {
  stream: Stream;
  slug: string;
  classes: ClassOption[];
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditStreamDialog stream={stream} slug={slug} classes={classes} />
      {!stream.archived ? (
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
          title="Archive this stream?"
          description="Streams are kept for history once archived."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archiveStream(slug, stream.id);
            if (!result.ok && result.error) success({ title: "Couldn’t archive", description: result.error });
          }}
        />
      ) : null}
    </div>
  );
}