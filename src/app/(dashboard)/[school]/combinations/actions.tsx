"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";

import {
  archiveCombination,
  createCombination,
  updateCombination,
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

export type Combination = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  archived: boolean;
  pathwayId: string | null;
  studentCount: number;
  subjects: { subjectId: string; name: string }[];
};

export type SubjectOption = { id: string; name: string; code: string | null };
export type PathwayOption = { id: string; name: string };

function CombinationFields({
  prefix,
  combination,
  pathways,
  subjects,
  fe,
}: {
  prefix: string;
  combination?: Combination;
  pathways: PathwayOption[];
  subjects: SubjectOption[];
  fe: Record<string, string[]> | undefined;
}) {
  const [selected, setSelected] = useState<string[]>(
    combination?.subjects.map((s) => s.subjectId) ?? []
  );
  const [query, setQuery] = useState("");

  const filtered = subjects.filter((s) =>
    s.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  return (
    <div className="grid gap-4">
      <Field id={`${prefix}-name`} label="Combination name" required error={fe?.name?.[0]}>
        <Input
          id={`${prefix}-name`}
          name="name"
          defaultValue={combination?.name ?? ""}
          placeholder="e.g. Combination A — Mathematics, Physics, Chemistry, Biology"
          required
          className={inputClasses}
        />
      </Field>
      <Field id={`${prefix}-code`} label="Code" required error={fe?.code?.[0]}>
        <Input
          id={`${prefix}-code`}
          name="code"
          defaultValue={combination?.code ?? ""}
          placeholder="e.g. COMB-A"
          required
          className={inputClasses}
        />
      </Field>
      <Field
        id={`${prefix}-pathway`}
        label="Pathway"
        hint="Optional — link this combination to a pathway."
        error={fe?.pathwayId?.[0]}
      >
        <select
          id={`${prefix}-pathway`}
          name="pathwayId"
          defaultValue={combination?.pathwayId ?? ""}
          className={inputClasses}
        >
          <option value="">Not linked to a pathway</option>
          {pathways.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${prefix}-description`} label="Description" error={fe?.description?.[0]}>
        <textarea
          id={`${prefix}-description`}
          name="description"
          defaultValue={combination?.description ?? ""}
          rows={2}
          placeholder="Optional notes about this combination."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
        />
      </Field>

      <Field
        id={`${prefix}-subjects`}
        label="Subjects in this combination"
        required
        hint={`${selected.length} subject${selected.length === 1 ? "" : "s"} selected. Click a subject to add or remove it.`}
        error={fe?.subjectIds?.[0]}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter subjects…"
          className={inputClasses}
        />
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No subjects found.</li>
          ) : (
            filtered.map((subject) => {
              const active = selected.includes(subject.id);
              return (
                <li key={subject.id}>
                  <button
                    type="button"
                    onClick={() => toggle(subject.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                      active ? "bg-muted/60" : ""
                    }`}
                  >
                    <span className={active ? "font-medium" : undefined}>{subject.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {subject.code ?? "—"}
                      {active ? " · added" : ""}
                    </span>
                  </button>
                  {active ? (
                    <input type="hidden" name="subjectIds" value={subject.id} />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Field>
    </div>
  );
}

export function NewCombinationDialog({
  slug,
  pathways,
  subjects,
}: {
  slug: string;
  pathways: PathwayOption[];
  subjects: SubjectOption[];
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createCombination>> | null, data: FormData) => {
      const result = await createCombination(slug, data);
      if (result.ok) success({ title: "Combination created." });
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
            New combination
          </Button>
        }
      />
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New subject combination</DialogTitle>
          <DialogDescription>
            Define the set of subjects students take within a Senior School
            pathway.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <CombinationFields
            prefix="comb"
            pathways={pathways}
            subjects={subjects}
            fe={failure?.fieldErrors}
          />
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

export function EditCombinationDialog({
  combination,
  slug,
  pathways,
  subjects,
}: {
  combination: Combination;
  slug: string;
  pathways: PathwayOption[];
  subjects: SubjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (
      _prev: Awaited<ReturnType<typeof updateCombination>> | null,
      data: FormData
    ) => {
      const result = await updateCombination(slug, combination.id, data);
      if (result.ok) {
        success({ title: "Combination updated." });
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit combination</DialogTitle>
          <DialogDescription>{combination.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <CombinationFields
            prefix="comb-edit"
            combination={combination}
            pathways={pathways}
            subjects={subjects}
            fe={failure?.fieldErrors}
          />
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

export function CombinationActions({
  combination,
  slug,
  pathways,
  subjects,
  canManage,
}: {
  combination: Combination;
  slug: string;
  pathways: PathwayOption[];
  subjects: SubjectOption[];
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditCombinationDialog
        combination={combination}
        slug={slug}
        pathways={pathways}
        subjects={subjects}
      />
      {!combination.archived ? (
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
          title="Archive this combination?"
          description="Combinations are kept for history once archived. It must not be assigned to any students."
          confirmLabel="Archive"
          destructive
          onConfirm={async () => {
            const result = await archiveCombination(slug, combination.id);
            if (result.ok) success({ title: "Combination archived." });
            else if (result.error) {
              success({ title: "Couldn’t archive", description: result.error });
            }
          }}
        />
      ) : null}
    </div>
  );
}