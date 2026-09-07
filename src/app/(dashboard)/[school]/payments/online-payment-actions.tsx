"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import {
  initiateOnlineFeePayment,
  verifyOnlineFeePayment,
} from "@/server/actions/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { success, error } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export function InitiatePaymentForm({
  slug,
  students,
  currency,
}: {
  slug: string;
  students: { id: string; name: string; studentNo: string | null }[];
  currency: string;
}) {
  const router = useRouter();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof initiateOnlineFeePayment>> | null, data: FormData) => {
      const result = await initiateOnlineFeePayment(slug, data);
      if (result.ok) {
        success({ title: "Online payment started.", description: "Confirm it at the payment page." });
        if (result.data?.checkoutUrl) setCheckoutUrl(result.data.checkoutUrl);
        router.refresh();
      }
      return result;
    },
    null
  );
  const failure = failureOf(state);

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <form action={formAction} className="flex flex-col gap-4">
        <Field id="oi-student" label="Student" required error={failure?.fieldErrors?.studentId?.[0]}>
          <select id="oi-student" name="studentId" className={inputClasses} required>
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
        <Field
          id="oi-amount"
          label={`Amount (${currency})`}
          required
          error={failure?.fieldErrors?.amount?.[0]}
        >
          <Input id="oi-amount" name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
        </Field>
        {failure ? <p className="text-sm text-destructive">{failure.error}</p> : null}
        {checkoutUrl ? (
          <p className="text-sm">
            Confirm at the payment page:{" "}
            <a href={checkoutUrl} className="text-primary underline" target="_blank" rel="noreferrer">
              open checkout
            </a>
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Starting…" : "Start online payment"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function VerifyFeePaymentButton({
  slug,
  transactionId,
}: {
  slug: string;
  transactionId: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const verify = async () => {
    setBusy(true);
    const result = await verifyOnlineFeePayment(slug, transactionId);
    setBusy(false);
    if (!result.ok) {
      error({ title: "Verification failed", description: result.error });
      router.refresh();
      return;
    }
    success({ title: "Payment verified", description: `Status: ${result.data?.status}` });
    router.refresh();
  };

  return (
    <Button size="sm" disabled={busy} onClick={verify}>
      {busy ? "Checking…" : "Verify"}
    </Button>
  );
}