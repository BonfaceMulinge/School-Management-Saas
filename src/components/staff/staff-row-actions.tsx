"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, Eye } from "lucide-react";

import { archiveStaff } from "@/server/actions/staff";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { success } from "@/components/ui/use-toast";
import {
  EditStaffDialog,
  type StaffDialogData,
} from "@/components/staff/edit-staff-dialog";

export function StaffRowActions({
  slug,
  staff,
  canManage,
}: {
  slug: string;
  staff: StaffDialogData;
  canManage: boolean;
}) {
  const [busyArchive, setBusyArchive] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/${slug}/staff/${staff.id}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
        View
      </Link>
      {canManage ? (
        <>
          <EditStaffDialog staff={staff} slug={slug} />
          {!staff.archived ? (
            <ConfirmDialog
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Archive className="size-4" aria-hidden="true" />
                </Button>
              }
              title="Archive this staff member?"
              description="Archived staff remain on record but are no longer counted as active staff and lose their linked portal access."
              confirmLabel="Archive"
              destructive
              busy={busyArchive}
              onConfirm={async () => {
                setBusyArchive(true);
                const result = await archiveStaff(slug, staff.id);
                setBusyArchive(false);
                if (result.ok) success({ title: "Staff member archived." });
                else if (result.error)
                  success({ title: "Couldn’t archive", description: result.error });
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}