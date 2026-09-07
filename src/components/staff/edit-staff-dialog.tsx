"use client";

import { useActionState, useState } from "react";

import { updateStaff } from "@/server/actions/staff";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import {
  StaffFormFields,
  type StaffFormDefaults,
} from "./staff-form-fields";

export type StaffDialogData = StaffFormDefaults & {
  id: string;
  archived: boolean;
  userId: string | null;
  userEmail: string | null;
};

export function EditStaffDialog({
  staff,
  slug,
}: {
  staff: StaffDialogData;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateStaff>> | null, data: FormData) => {
      const result = await updateStaff(slug, staff.id, data);
      if (result.ok) {
        success({ title: "Staff member updated." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const defaults: Partial<StaffFormDefaults> = {
    firstName: staff.firstName,
    middleName: staff.middleName,
    lastName: staff.lastName,
    staffNo: staff.staffNo,
    role: staff.role,
    phone: staff.phone,
    dateJoined: staff.dateJoined,
    department: staff.department,
    position: staff.position,
    status: staff.status,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit staff member</DialogTitle>
          <DialogDescription>
            Update the employment record for this staff member.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <StaffFormFields
            fe={failure?.fieldErrors}
            defaults={defaults}
            account={{
              toggleName: "updateAccount",
              toggleLabel: "Linked login account",
              defaultOn: staff.userId !== null,
              emailDefault: staff.userEmail ?? "",
              hint: staff.userId
                ? "Edit the email to relink this staff member to an account."
                : "Provide an email to link this staff member to an account.",
            }}
          />
          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}