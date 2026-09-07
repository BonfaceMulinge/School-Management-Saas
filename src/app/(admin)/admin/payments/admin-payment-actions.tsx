"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  initiateSubscriptionPaymentAction,
  verifySubscriptionPaymentAction,
} from "@/server/actions/integrations";
import { Button } from "@/components/ui/button";
import { success, error } from "@/components/ui/use-toast";

export function ChargeSubscriptionButton({
  schoolId,
  schoolName,
  amountLabel,
}: {
  schoolId: string;
  schoolName: string;
  amountLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const charge = async () => {
    setBusy(true);
    const result = await initiateSubscriptionPaymentAction(schoolId);
    setBusy(false);
    if (!result.ok) {
      error({ title: "Could not start the charge", description: result.error });
      return;
    }
    success({ title: "Subscription payment started" });
    router.refresh();
    router.push(`/admin/payments?focus=${result.data?.transactionId ?? ""}`);
  };

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={charge}>
      {busy ? "Starting…" : `Charge ${schoolName} (${amountLabel})`}
    </Button>
  );
}

export function VerifyTransactionButton({
  transactionId,
  label = "Verify",
}: {
  transactionId: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const verify = async () => {
    setBusy(true);
    const result = await verifySubscriptionPaymentAction(transactionId);
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
      {busy ? "Checking…" : label}
    </Button>
  );
}