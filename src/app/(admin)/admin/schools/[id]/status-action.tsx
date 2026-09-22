"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { setSchoolStatusAction } from "@/server/actions/admin";

type School = {
  id: string;
  name: string;
  status: string;
};

export function StatusAction({ school }: { school: School }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const newStatus = school.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const label = newStatus === "SUSPENDED" ? "Suspend" : "Activate";

  const handleClick = async () => {
    setPending(true);
    try {
      const res = await setSchoolStatusAction(school.id, newStatus);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setPending(false);
    }
  };

  if (newStatus === "SUSPENDED") {
    return (
      <ConfirmDialog
        trigger={<Button variant="destructive" size="sm" disabled={pending}>Suspend</Button>}
        title="Suspend school"
        description="Are you sure you want to suspend this school? No data will be deleted, and you can activate the school again at any time."
        confirmLabel="Suspend"
        destructive
        onConfirm={handleClick}
        busy={pending}
      />
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Working…" : label}
    </Button>
  );
}