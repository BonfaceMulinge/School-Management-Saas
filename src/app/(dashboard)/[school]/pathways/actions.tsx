"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import {
  archivePathway,
  createPathway,
  updatePathway,
} from "@/server/actions/pathways";
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

export type Pathway = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  archived: boolean;
  studentCount: number;
  combinationCount: number;
};

function PathwayFields({
  prefix,
  pathway,
  fe,
}: {
  prefix: string;
  pathway?: Pathway;
  fe: Record<string, string[]> | undefined;
}) {
  return (
    <div className="grid gap-4">
      <Field id={`${prefix}-name`} label="Pathway name" required error={fe?.name?.[0]}>
        <Input
          id={`${prefix}-name`}
          name="name"
          defaultValue={pathway?.name ?? ""}
          placeholder="e.g. Science, Technology, Engineering and Mathematics"
          required
          className={inputClasses}
        />
      </Field>
      <Field id={`${prefix}-code`} label="Code" required error={fe?.code?.[0]}>
        <Input
          id={`${prefix}-code`}
          name="code"
          defaultValue={pathway?.code ?? ""}
          placeholder="e.g. STEM"
          required
          className={inputClasses}
        />
      </Field>
      <Field id={`${prefix}-description`} label="Description" error={fe?.description?.[0]}>
        <textarea
          id={`${prefix}-description`}
          name="description"
          defaultValue={pathway?.description ?? ""}
          rows={3}
          placeholder="Optional notes about this pathway."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
      </Field>
    </div>
  );
}

export function NewPathwayDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createPathway>> | null, data: FormData) => {
      const result = await createPathway(slug, data);
      if (result.ok) success({ title: "Pathway created." });
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
            New pathway
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Senior School pathway</DialogTitle>
          <DialogDescription>
            Pathways describe the learning areas offered to Grade 10–12 students
            under the CBC.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <PathwayFields prefix="pw" fe={failure?.fieldErrors} />
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

export function EditPathwayDialog({
  pathway,
  slug,
}: {
  pathway: Pathway;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updatePathway>> | null, data: FormData) => {
      const result = await updatePathway(slug, pathway.id, data);
      if (result.ok) {
        success({ title: "Pathway updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit pathway</DialogTitle>
          <DialogDescription>{pathway.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <PathwayFields prefix="pw-edit" pathway={pathway} fe={failure?.fieldErrors} />
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

export function PathwayActions({
  pathway,
  slug,
  canManage,
}: {
  pathway: Pathway;
  slug: string;
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditPathwayDialog pathway={pathway} slug={slug} />
      {!pathway.archived ? (
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
          title="Archive this pathway?"
          description="Pathways are kept for history once archived. It must not be assigned to any students."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archivePathway(slug, pathway.id);
            if (result.ok) success({ title: "Pathway archived." });
            else if (result.error) {
              success({ title: "Couldn’t archive", description: result.error });
            }
          }}
        />
      ) : null}
    </div>
  );
}