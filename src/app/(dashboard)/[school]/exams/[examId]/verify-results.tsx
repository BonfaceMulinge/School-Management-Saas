"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";

import { verifyExamResults, reopenExamResults } from "@/server/actions/exams";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { success } from "@/components/ui/use-toast";

export function VerifyResultsButton({
  slug,
  examId,
  verified,
}: {
  slug: string;
  examId: string;
  verified: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const run = async () => {
    setBusy(true);
    const result = verified
      ? await reopenExamResults(slug, examId)
      : await verifyExamResults(slug, examId);
    setBusy(false);
    if (result.ok) {
      success({
        title: verified ? "Results sent back for correction." : "Results verified.",
        description: verified
          ? "The exam is open again for mark entry."
          : "Report cards for this exam are now released.",
      });
      router.refresh();
    } else if (result.error) {
      success({ title: "Couldn’t update results", description: result.error });
    }
  };

  if (verified) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={run}
      >
        <Undo2 className="size-4" aria-hidden="true" />
        Send back for correction
      </Button>
    );
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" disabled={busy}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {busy ? "Verifying…" : "Verify & release report cards"}
        </Button>
      }
      title="Verify these results?"
      description="Every student on the register must have a mark in every subject. Verifying releases the report cards for this exam."
      confirmLabel="Verify results"
      onConfirm={run}
    />
  );
}