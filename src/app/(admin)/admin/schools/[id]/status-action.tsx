"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { setSchoolStatusAction } from "@/server/actions/admin";

type School = {
  id: string;
  name: string;
  status: string;
};

export function StatusAction({ school, onSuccess }: { school: School; onSuccess: () => void }) {
  const [pending, setPending] = useState(false);
  const newStatus = school.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const label = newStatus === "SUSPENDED" ? "Suspend" : "Activate";
  const variant = newStatus === "SUSPENDED" ? "destructive" : "default";

  const handleClick = async () => {
    setPending(true);
    try {
      const res = await setSchoolStatusAction(school.id, newStatus);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleClick}
      disabled={pending}
    >
      {pending ? "Working…" : label}
    </Button>
  );
}