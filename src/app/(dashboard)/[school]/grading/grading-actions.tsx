"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import {
  upsertGradeScale,
  setDefaultGradeScale,
  deleteGradeScale,
} from "@/server/actions/grading";
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

export type ScaleRow = {
  id: string;
  name: string;
  isDefault: boolean;
  bands: {
    id: string;
    minPercent: number;
    maxPercent: number;
    grade: string;
    points: number | null;
    remark: string;
  }[];
};

type BandRow = { key: string; min: string; max: string; grade: string; points: string; remark: string };

function initialBands(scale?: ScaleRow): BandRow[] {
  if (!scale) return [];
  return scale.bands.map((b) => ({
    key: `existing-${b.id}`,
    min: String(b.minPercent),
    max: String(b.maxPercent),
    grade: b.grade,
    points: b.points === null ? "" : String(b.points),
    remark: b.remark,
  }));
}

function ScaleFormFields({
  scale,
  mode,
}: {
  scale?: ScaleRow;
  mode: "create" | "edit";
}) {
  const counter = useRef(0);
  const [name, setName] = useState(scale?.name ?? "");
  const [isDefault, setIsDefault] = useState(scale?.isDefault ?? false);
  const [rows, setRows] = useState<BandRow[]>(() => initialBands(scale));

  const addRow = () => {
    counter.current += 1;
    setRows((prev) => [
      ...prev,
      { key: `b${counter.current}`, min: "", max: "", grade: "", points: "", remark: "" },
    ]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const patchRow = (key: string, patch: Partial<BandRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="scale-name" label="Scale name" required>
          <Input
            id="scale-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className={inputClasses}
            placeholder="e.g. Standard grading"
          />
        </Field>
        <Field id="scale-default" label="Default scale">
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="scale-default"
              name="isDefault"
              value="true"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4 accent-primary"
            />
            Use as the school default
          </label>
        </Field>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Grade bands</p>
            <p className="text-xs text-muted-foreground">
              Disjoint percentage ranges; the highest matching band wins.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            Add band
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No bands yet — add at least one.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.key} className="flex flex-wrap items-end gap-3 px-4 py-3">
                <Field id={`grade-${row.key}`} label="Grade" className="w-24">
                  <Input
                    id={`grade-${row.key}`}
                    name={`grade[${row.key}]`}
                    value={row.grade}
                    onChange={(e) => patchRow(row.key, { grade: e.target.value })}
                    className={inputClasses}
                    placeholder="A"
                  />
                </Field>
                <Field id={`min-${row.key}`} label="Min %">
                  <Input
                    id={`min-${row.key}`}
                    name={`min[${row.key}]`}
                    inputMode="decimal"
                    value={row.min}
                    onChange={(e) => patchRow(row.key, { min: e.target.value })}
                    className={`${inputClasses} w-24`}
                    placeholder="80"
                  />
                </Field>
                <Field id={`max-${row.key}`} label="Max %">
                  <Input
                    id={`max-${row.key}`}
                    name={`max[${row.key}]`}
                    inputMode="decimal"
                    value={row.max}
                    onChange={(e) => patchRow(row.key, { max: e.target.value })}
                    className={`${inputClasses} w-24`}
                    placeholder="100"
                  />
                </Field>
                <Field id={`points-${row.key}`} label="Points" hint="Optional">
                  <Input
                    id={`points-${row.key}`}
                    name={`points[${row.key}]`}
                    inputMode="decimal"
                    value={row.points}
                    onChange={(e) => patchRow(row.key, { points: e.target.value })}
                    className={`${inputClasses} w-24`}
                    placeholder="12"
                  />
                </Field>
                <Field id={`remark-${row.key}`} label="Remark" className="min-w-40 flex-1">
                  <Input
                    id={`remark-${row.key}`}
                    name={`remark[${row.key}]`}
                    value={row.remark}
                    onChange={(e) => patchRow(row.key, { remark: e.target.value })}
                    className={inputClasses}
                    placeholder="Excellent"
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove band"
                  className="mb-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="sr-only" aria-hidden="true">{mode}</span>
    </div>
  );
}

export function NewScaleDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof upsertGradeScale>> | null, data: FormData) => {
      const result = await upsertGradeScale(slug, data);
      if (result.ok) success({ title: "Grading scale created." });
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
            New scale
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New grading scale</DialogTitle>
          <DialogDescription>
            Define percentage bands that map to grades, points and remarks.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <ScaleFormFields mode="create" />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create scale"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditScaleDialog({ slug, scale }: { slug: string; scale: ScaleRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof upsertGradeScale>> | null, data: FormData) => {
      const result = await upsertGradeScale(slug, data, scale.id);
      if (result.ok) {
        success({ title: "Grading scale updated." });
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit scale</DialogTitle>
          <DialogDescription>{scale.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <ScaleFormFields scale={scale} mode="edit" />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetDefaultButton({
  slug,
  scale,
  onDone,
}: {
  slug: string;
  scale: ScaleRow;
  onDone: () => void;
}) {
  if (scale.isDefault) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        const result = await setDefaultGradeScale(slug, scale.id);
        if (!result.ok && result.error) {
          success({ title: "Couldn’t set default", description: result.error });
        }
        onDone();
      }}
    >
      <Check className="size-4" aria-hidden="true" />
      Set default
    </Button>
  );
}

export function ScaleActions({
  slug,
  scale,
  canManage,
  scaleCount,
}: {
  slug: string;
  scale: ScaleRow;
  canManage: boolean;
  scaleCount: number;
}) {
  if (!canManage) return null;

  return (
    <div className="flex items-center gap-2">
      <SetDefaultButton slug={slug} scale={scale} onDone={() => {}} />
      <EditScaleDialog slug={slug} scale={scale} />
      {scaleCount > 1 ? (
        <ConfirmDialog
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </Button>
          }
          title="Delete this scale?"
          description="Historical results are kept, but the scale will no longer be available for new grading."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            const result = await deleteGradeScale(slug, scale.id);
            if (!result.ok && result.error) {
              success({ title: "Couldn’t delete", description: result.error });
            }
          }}
        />
      ) : null}
    </div>
  );
}