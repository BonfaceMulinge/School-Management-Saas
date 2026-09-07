"use client";

import { useState } from "react";
import { Archive } from "lucide-react";

import { archiveStaff } from "@/server/actions/staff";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { success } from "@/components/ui/use-toast";

export function StaffArchiveAction({
  slug,
  staffId,
}: {
  slug: string;
  staffId: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <ConfirmDialog
      trigger={
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Archive className="size-4" aria-hidden="true" />
          Archive
        </Button>
      }
      title="Archive this staff member?"
      description="Archived staff remain on record but are no longer counted as active staff and lose their linked portal access."
      confirmLabel="Archive"
      destructive
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        const result = await archiveStaff(slug, staffId);
        setBusy(false);
        if (result.ok) success({ title: "Staff member archived." });
        else if (result.error)
          success({ title: "Couldn’t archive", description: result.error });
      }}
    />
  );
}