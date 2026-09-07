"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { archiveSchoolAction } from "@/server/actions/admin";

type School = {
  id: string;
  name: string;
  status: string;
};

export function ArchiveAction({ school, onSuccess }: { school: School; onSuccess: () => void }) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      const res = await archiveSchoolAction(school.id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to archive school");
    } finally {
      setPending(false);
    }
  };

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={pending}
        >
          Archive
        </Button>
      }
      title="Archive school"
      description={`Permanently archive "${school.name}"? This cannot be undone.`}
      onConfirm={handleConfirm}
      busy={pending}
    />
  );
}