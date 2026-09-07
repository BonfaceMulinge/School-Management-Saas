"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, RotateCcw } from "lucide-react";

import {
  recordPayment,
  correctPayment,
  reversePayment,
} from "@/server/actions/finance";
import { paymentMethodLabel } from "@/lib/finance";
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
import { formatMoney } from "@/lib/format";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const METHODS = ["CASH", "BANK", "CHEQUE", "OTHER"] as const;

export type PaymentRow = {
  id: string;
  receiptNo: string;
  studentId: string;
  academicYearId: string;
  termId: string | null;
  studentName: string;
  studentNo: string | null;
  amount: number;
  dateIso: string;
  method: string;
  otherMethod: string | null;
  referenceNo: string | null;
  note: string | null;
  status: string;
  yearName: string;
  termName: string;
  classStream: string;
  reversedAt: string | null;
  recordedByName: string;
};

function todayLocal(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RecordPaymentDialog({
  slug,
  students,
  filterQuery,
}: {
  slug: string;
  students: { id: string; name: string; studentNo: string | null }[];
  filterQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const router = useRouter();

  const openForm = () => {
    if (!studentId) return;
    const params = new URLSearchParams(filterQuery);
    params.set("record", studentId);
    params.delete("page");
    setOpen(false);
    router.push(`/${slug}/finance/payments?${params.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        Record payment
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>Choose the student you want to record a payment for.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field id="pay-student" label="Student" required>
            <select
              id="pay-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={selectClasses}
            >
              <option value="" disabled>
                Select a student…
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.studentNo ? ` (${s.studentNo})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end">
            <Button onClick={openForm} disabled={!studentId}>
              Continue
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentFormDialog({
  slug,
  studentId,
  studentLabel,
  studentNo,
  defaultYearId,
  yearName,
  terms,
  selectedTermId,
  serials,
  outstanding,
  currency,
  filterQuery,
}: {
  slug: string;
  studentId: string;
  studentLabel: string;
  studentNo: string | null;
  defaultYearId: string;
  yearName: string;
  terms: { id: string; name: string }[];
  selectedTermId: string | null;
  serials: { savedName: string; owed: number }[];
  outstanding: number;
  currency: string;
  filterQuery: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof recordPayment>> | null, data: FormData) => {
      const result = await recordPayment(slug, data);
      if (result.ok) {
        success({ title: "Payment recorded." });
        router.push(`/${slug}/finance/payments${filterQuery ? `?${filterQuery}` : ""}`);
        router.refresh();
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  const dismiss = () => {
    router.push(`/${slug}/finance/payments${filterQuery ? `?${filterQuery}` : ""}`);
    router.refresh();
  };

  const switchTerm = (term: string) => {
    const params = new URLSearchParams(filterQuery);
    params.set("record", studentId);
    if (term) params.set("termId", term);
    else params.delete("termId");
    router.push(`/${slug}/finance/payments?${params.toString()}`);
  };

  return (
    <Dialog defaultOpen onOpenChange={(open) => (!open ? dismiss() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment — {studentLabel}</DialogTitle>
          <DialogDescription>
            {yearName} · {studentNo ?? "no admission number"}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="academicYearId" value={defaultYearId} />
          <input type="hidden" name="termId" value={selectedTermId ?? ""} />

          {serials.length > 0 && (
            <div className="mb-4 rounded-lg border border-border">
              <div className="border-b border-border px-4 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Outstanding bills in scope</p>
                <p className="text-xl font-semibold">
                  {formatMoney(Math.max(0, outstanding), currency)}
                </p>
              </div>
              <ul className="max-h-40 divide-y divide-border overflow-y-auto">
                {serials.map((s, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-1.5 text-sm">
                    <span>{s.savedName}</span>
                    <span className="text-muted-foreground">{formatMoney(s.owed, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field id="pay-term" label="Period">
              <select
                id="pay-term"
                value={selectedTermId ?? ""}
                onChange={(e) => switchTerm(e.target.value)}
                className={selectClasses}
              >
                <option value="">Whole year</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pay-date" label="Date" required>
              <Input
                id="pay-date"
                name="date"
                type="date"
                defaultValue={todayLocal()}
                required
                className={inputClasses}
              />
            </Field>
            <Field id="pay-amount" label="Amount" required>
              <Input
                id="pay-amount"
                name="amount"
                inputMode="decimal"
                placeholder="0.00"
                required
                className={inputClasses}
              />
            </Field>
            <Field id="pay-method" label="Method">
              <select
                id="pay-method"
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
                className={selectClasses}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {method === "OTHER" ? (
            <div className="mt-4">
              <Field id="pay-other-method" label="Describe the method" required>
                <Input
                  id="pay-other-method"
                  name="otherMethod"
                  placeholder="e.g. M-Pesa, mobile money…"
                  className={inputClasses}
                />
              </Field>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field id="pay-reference" label="Reference / receipt">
              <Input
                id="pay-reference"
                name="referenceNo"
                placeholder="Optional"
                className={inputClasses}
              />
            </Field>
            <Field id="pay-receipt" label="Receipt no" hint="Leave blank to auto-generate">
              <Input id="pay-receipt" name="receiptNo" placeholder="Auto" className={inputClasses} />
            </Field>
          </div>

          <div className="mt-4">
            <Field id="pay-note" label="Note">
              <Input
                id="pay-note"
                name="note"
                placeholder="Optional"
                className={inputClasses}
              />
            </Field>
          </div>

          {failure?.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {failure.error}
            </p>
          ) : null}

          <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
            Payments settle the oldest outstanding charge first. No term chosen means the whole year.
          </p>

          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CorrectPaymentDialog({
  slug,
  payment,
}: {
  slug: string;
  payment: PaymentRow;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>(payment.method);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof correctPayment>> | null, data: FormData) => {
      const result = await correctPayment(slug, payment.id, data);
      if (result.ok) {
        success({ title: "Payment corrected." });
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
        Correct
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct payment</DialogTitle>
          <DialogDescription>
            {payment.receiptNo} — {payment.studentName} ({payment.dateIso}). Every correction is
            kept on the audit trail with a reason.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate>
          <input type="hidden" name="studentId" value={payment.studentId} />
          <input type="hidden" name="academicYearId" value={payment.academicYearId} />
          <input type="hidden" name="termId" value={payment.termId ?? ""} />

          <div className="grid grid-cols-2 gap-4">
            <Field id="corr-amount" label="Amount" required>
              <Input
                id="corr-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={payment.amount.toFixed(2)}
                required
                className={inputClasses}
              />
            </Field>
            <Field id="corr-date" label="Date" required>
              <Input
                id="corr-date"
                name="date"
                type="date"
                defaultValue={payment.dateIso}
                required
                className={inputClasses}
              />
            </Field>
            <Field id="corr-method" label="Method">
              <select
                id="corr-method"
                name="method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={selectClasses}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabel(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="corr-reference" label="Reference">
              <Input
                id="corr-reference"
                name="referenceNo"
                defaultValue={payment.referenceNo ?? ""}
                className={inputClasses}
              />
            </Field>
            <Field id="corr-receipt" label="Receipt no">
              <Input
                id="corr-receipt"
                name="receiptNo"
                defaultValue={payment.receiptNo}
                className={inputClasses}
              />
            </Field>
            <Field id="corr-note" label="Note">
              <Input id="corr-note" name="note" defaultValue={payment.note ?? ""} className={inputClasses} />
            </Field>
          </div>

          {method === "OTHER" ? (
            <div className="mt-4">
              <Field id="corr-other-method" label="Describe the method">
                <Input id="corr-other-method" name="otherMethod" className={inputClasses} />
              </Field>
            </div>
          ) : null}

          <div className="mt-4">
            <Field id="corr-reason" label="Reason" required hint="Required — kept on the audit trail.">
              <Input
                id="corr-reason"
                name="reason"
                placeholder="e.g. Operator entered wrong amount…"
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

          <div className="mt-5 flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save correction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReversePaymentDialog({
  slug,
  payment,
  currency,
}: {
  slug: string;
  payment: PaymentRow;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    const result = await reversePayment(slug, payment.id, reason);
    setBusy(false);
    if (result.ok) {
      success({ title: "Payment reversed." });
      setOpen(false);
    } else {
      success({ title: "Couldn’t reverse", description: result.error });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        Reverse
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payment</DialogTitle>
          <DialogDescription>
            {payment.receiptNo} — {payment.studentName}, {formatMoney(payment.amount, currency)}. The
            payment is voided in place and never deleted; a permanent reversal record is kept.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field id="rev-reason" label="Reason" required hint="Required for the audit trail.">
            <Input
              id="rev-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Duplicate entry, wrong student…"
              className={inputClasses}
            />
          </Field>
          {reason.trim().length > 0 && reason.trim().length < 3 ? (
            <p role="alert" className="text-sm text-destructive">
              A clear reason is required (at least 3 characters).
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={busy || reason.trim().length < 3}
            >
              {busy ? "Reversing…" : "Reverse payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}