"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Percent } from "lucide-react";

import { chargeStudents, addChargeAdjustment } from "@/server/actions/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type ChargeRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string | null;
  itemName: string;
  amount: number;
  net: number;
  adjustments: { id: string; type: string; amount: number; reason: string; createdAt: Date }[];
  period: string;
  createdAt: Date;
};

export function AssignChargesForm({
  slug,
  structures,
  selectedId,
  items,
  students,
  structureLabel,
  filterQuery,
}: {
  slug: string;
  structures: { id: string; name: string; label: string }[];
  selectedId: string;
  items: { id: string; name: string; amount: number }[];
  students: { id: string; name: string; studentNo: string | null }[];
  structureLabel: string;
  filterQuery: string;
}) {
  const router = useRouter();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id))
  );
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [chargeAll, setChargeAll] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof chargeStudents>> | null, data: FormData) => {
      const result = await chargeStudents(slug, data);
      if (result.ok) {
        success({
          title: "Charges applied.",
          description: `${result.data?.created ?? 0} created, ${result.data?.skipped ?? 0} already existed.`,
        });
        router.refresh();
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  const switchStructure = (id: string) => {
    const params = new URLSearchParams(filterQuery);
    params.set("structureId", id);
    params.delete("page");
    router.push(`/${slug}/finance/charges?${params.toString()}`);
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = selectedItems.size === items.length;

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Assign charges</h2>
          <p className="text-xs text-muted-foreground">
            Billing against {structureLabel}. Pick items and students, then submit.
          </p>
        </div>
        <select
          aria-label="Fee structure"
          value={selectedId}
          onChange={(e) => switchStructure(e.target.value)}
          className={selectClasses + " w-64"}
        >
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <form action={formAction} noValidate>
        <input type="hidden" name="structureId" value={selectedId} />

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Fee items</p>
              <button
                type="button"
                onClick={() =>
                  setSelectedItems(
                    allSelected ? new Set<string>() : new Set(items.map((i) => i.id))
                  )
                }
                className="text-xs font-medium text-primary hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                This structure has no active fee items.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name={`item[${item.id}]`}
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="size-4 rounded border-border"
                        />
                        {item.name}
                      </span>
                      <span className="font-medium">{item.amount.toFixed(2)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Students{" "}
                <span className="text-xs text-muted-foreground">
                  ({chargeAll ? "all enrolled" : `${selectedStudents.size} selected`})
                </span>
              </p>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  name="allStudents"
                  value="1"
                  checked={chargeAll}
                  onChange={(e) => setChargeAll(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Charge all {students.length} enrolled
              </label>
            </div>
            {students.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No active enrollments for this structure&apos;s class/stream.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {students.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        name={`student[${s.id}]`}
                        checked={chargeAll || selectedStudents.has(s.id)}
                        disabled={chargeAll}
                        onChange={() => toggleStudent(s.id)}
                        className="size-4 rounded border-border"
                      />
                      <span>{s.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{s.studentNo ?? ""}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {failure?.error ? (
          <p role="alert" className="mx-5 mb-3 text-sm text-destructive">
            {failure.error}
          </p>
        ) : null}

        <div className="border-t border-border px-5 py-4">
          <Button type="submit" disabled={isPending || selectedItems.size === 0 || (!chargeAll && selectedStudents.size === 0)}>
            {isPending ? "Applying…" : "Apply charges"}
          </Button>
        </div>
      </form>
    </section>
  );
}

const ADJUSTMENT_OPTIONS = [
  { value: "DISCOUNT", label: "Discount" },
  { value: "WAIVER", label: "Waiver" },
  { value: "ADJUSTMENT", label: "Adjustment" },
];

export function AdjustChargeDialog({
  slug,
  charge,
}: {
  slug: string;
  charge: ChargeRow;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof addChargeAdjustment>> | null, data: FormData) => {
      const result = await addChargeAdjustment(slug, data);
      if (result.ok) {
        success({ title: "Adjustment recorded." });
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
        Adjust
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust charge</DialogTitle>
          <DialogDescription>
            {charge.studentName} — {charge.itemName} (net {charge.net.toFixed(2)})
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <input type="hidden" name="chargeId" value={charge.id} />
          <div className="grid gap-4">
            <Field id="adjustment-type" label="Type" required>
              <select id="adjustment-type" name="type" defaultValue="DISCOUNT" className={selectClasses}>
                {ADJUSTMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="adjustment-amount" label="Amount" required>
              <Input
                id="adjustment-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                className={inputClasses}
              />
            </Field>
            <Field id="adjustment-reason" label="Reason" required hint="Shown on statements and kept on the audit trail.">
              <Input
                id="adjustment-reason"
                name="reason"
                placeholder="e.g. Sibling discount, relief approval…"
                required
                className={inputClasses}
              />
            </Field>
          </div>
          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}
          {charge.adjustments.length > 0 ? (
            <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Percent className="mt-0.5 size-3.5" aria-hidden="true" />
              {charge.adjustments.length} existing adjustment{charge.adjustments.length === 1 ? "" : "s"} —{" "}
              {charge.adjustments.map((a) => `${a.type} ${a.amount}`).join(", ")}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Recording…" : "Record adjustment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}