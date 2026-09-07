"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createStaff } from "@/server/actions/staff";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";
import { StaffFormFields } from "./staff-form-fields";

export function NewStaffDialog({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createStaff>> | null, data: FormData) => {
      const result = await createStaff(slug, data);
      if (result.ok) success({ title: "Staff member added." });
      return result;
    },
    null
  );

  const failure = failureOf(state);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New staff member
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New staff member</DialogTitle>
          <DialogDescription>
            Add an employment record for this school. Login access is optional.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <StaffFormFields
            fe={failure?.fieldErrors}
            account={{
              toggleName: "createAccount",
              toggleLabel: "Create login account",
              defaultOn: false,
              emailDefault: "",
              hint: "Reuses an existing account with this email; joins the school with the matching staff role.",
            }}
          />
          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}