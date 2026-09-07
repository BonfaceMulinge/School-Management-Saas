"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import {
  createFeeStructure,
  updateFeeStructure,
  archiveFeeStructure,
} from "@/server/actions/finance";
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
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type StructureFormData = {
  years: { id: string; name: string; isActive: boolean; terms: { id: string; name: string }[] }[];
  classes: { id: string; name: string; streams: { id: string; name: string }[] }[];
};

export type StructureRow = {
  id: string;
  name: string;
  description: string | null;
  academicYearId: string;
  termId: string;
  classId: string;
  streamId: string | null;
  archived: boolean;
  items: {
    itemId: string;
    name: string;
    amount: number;
    description: string | null;
  }[];
};

type ItemRow = { key: string; name: string; amount: string; description: string };

function buildItems(structure?: StructureRow): ItemRow[] {
  if (!structure) return [];
  return structure.items.map((i) => ({
    key: `existing-${i.itemId}`,
    name: i.name,
    amount: i.amount.toFixed(2),
    description: i.description ?? "",
  }));
}

function StructureFormFields({
  formData,
  structure,
  mode,
}: {
  formData: StructureFormData;
  structure?: StructureRow;
  mode: "create" | "edit";
}) {
  const counter = useRef(0);
  const [yearId, setYearId] = useState(structure?.academicYearId ?? buildInitialYearId(formData));
  const [classId, setClassId] = useState(structure?.classId ?? "");
  const [streamId, setStreamId] = useState(structure?.streamId ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() => buildItems(structure));

  const year = formData.years.find((y) => y.id === yearId);
  const klass = formData.classes.find((c) => c.id === classId);

  const addRow = () => {
    counter.current += 1;
    setRows((prev) => [...prev, { key: `r${counter.current}`, name: "", amount: "", description: "" }]);
  };

  const removeRow = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const patchRow = (key: string, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="structure-name" label="Name" required>
          <Input
            id="structure-name"
            name="name"
            defaultValue={structure?.name}
            required
            className={inputClasses}
            placeholder="e.g. Term 1 Fee Structure"
          />
        </Field>
        <Field id="structure-year" label="Academic year" required>
          <select
            id="structure-year"
            name="academicYearId"
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            className={selectClasses}
          >
            {formData.years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="structure-term" label="Term" required>
          <select
            id="structure-term"
            name="termId"
            defaultValue={structure?.termId ?? ""}
            className={selectClasses}
          >
            <option value="" disabled>
              Select a term
            </option>
            {year?.terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="structure-class" label="Class" required>
          <select
            id="structure-class"
            name="classId"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setStreamId("");
            }}
            className={selectClasses}
          >
            <option value="" disabled>
              Select a class
            </option>
            {formData.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="structure-stream" label="Stream" hint="Optional — whole class when empty">
          <select
            id="structure-stream"
            name="streamId"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            className={selectClasses}
          >
            <option value="">Whole class</option>
            {klass?.streams.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="structure-description" label="Description">
          <Input
            id="structure-description"
            name="description"
            defaultValue={structure?.description ?? ""}
            className={inputClasses}
            placeholder="Optional note"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Fee items</p>
            <p className="text-xs text-muted-foreground">
              e.g. tuition, transport, meals, activity fees.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-4" aria-hidden="true" />
            Add item
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No fee items yet — add at least one.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <div key={row.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-end">
                <Field id={`item-name-${row.key}`} label="Name" className="min-w-0 flex-1">
                  <Input
                    id={`item-name-${row.key}`}
                    name={`name[${row.key}]`}
                    placeholder="Tuition"
                    value={row.name}
                    onChange={(e) => patchRow(row.key, { name: e.target.value })}
                    className={inputClasses}
                  />
                </Field>
                <Field id={`item-amount-${row.key}`} label="Amount" className="w-36">
                  <Input
                    id={`item-amount-${row.key}`}
                    name={`amount[${row.key}]`}
                    inputMode="decimal"
                    placeholder="1000.00"
                    value={row.amount}
                    onChange={(e) => patchRow(row.key, { amount: e.target.value })}
                    className={inputClasses}
                  />
                </Field>
                <Field id={`item-desc-${row.key}`} label="Description" className="min-w-0 flex-1">
                  <Input
                    id={`item-desc-${row.key}`}
                    name={`description[${row.key}]`}
                    placeholder="Optional"
                    value={row.description}
                    onChange={(e) => patchRow(row.key, { description: e.target.value })}
                    className={inputClasses}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove fee item"
                  className="mb-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <span className="sr-only" aria-hidden="true">{mode === "edit" ? "edit" : "create"}</span>
    </div>
  );
}

function buildInitialYearId(formData: StructureFormData): string {
  return formData.years.find((y) => y.isActive)?.id ?? formData.years[0]?.id ?? "";
}

export function NewStructureDialog({
  slug,
  formData,
}: {
  slug: string;
  formData: StructureFormData;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createFeeStructure>> | null, data: FormData) => {
      const result = await createFeeStructure(slug, data);
      if (result.ok) {
        success({ title: "Fee structure created." });
        router.refresh();
      }
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
            New structure
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New fee structure</DialogTitle>
          <DialogDescription>
            Define the fee items a class will be billed for in a year and term.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <StructureFormFields formData={formData} mode="create" />
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create structure"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStructureDialog({
  slug,
  structure,
  formData,
}: {
  slug: string;
  structure: StructureRow;
  formData: StructureFormData;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateFeeStructure>> | null, data: FormData) => {
      const result = await updateFeeStructure(slug, structure.id, data);
      if (result.ok) {
        success({ title: "Fee structure updated." });
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
          <DialogTitle>Edit fee structure</DialogTitle>
          <DialogDescription>{structure.name}</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <StructureFormFields formData={formData} structure={structure} mode="edit" />
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

export function StructureActions({
  slug,
  structure,
  hasCharges,
  formData,
  canManage,
}: {
  slug: string;
  structure: StructureRow;
  hasCharges: boolean;
  formData: StructureFormData;
  canManage: boolean;
}) {
  if (!canManage) return <span className="text-xs text-muted-foreground">—</span>;
  if (structure.archived) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <EditStructureDialog slug={slug} structure={structure} formData={formData} />
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
        title="Archive this fee structure?"
        description={
          hasCharges
            ? "Existing charges are snapshotted and stay intact. The structure can no longer be edited or used for new charges."
            : "The structure keeps its fee items but can no longer be edited or used for new charges."
        }
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          const result = await archiveFeeStructure(slug, structure.id);
          if (!result.ok && result.error) {
            success({ title: "Couldn’t archive", description: result.error });
          }
        }}
      />
    </div>
  );
}