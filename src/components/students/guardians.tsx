"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  createParentUser,
  linkGuardian,
  setPrimaryGuardian,
  unlinkGuardian,
} from "@/server/actions/guardians";
import { failureOf } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { success } from "@/components/ui/use-toast";

export type GuardianParentRef = {
  id: string;
  name: string | null;
  email: string;
};

export type GuardianRowProps = {
  id: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
  guardian: { name: string | null; email: string };
};

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type GuardianStudentRef = {
  id: string;
  firstName: string;
  lastName: string;
  studentNo: string | null;
};

export function AddGuardianDialog({
  slug,
  parents,
  students,
  studentId,
  guardianUserId,
}: {
  slug: string;
  parents: GuardianParentRef[];
  students?: GuardianStudentRef[];
  studentId?: string;
  guardianUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof linkGuardian>> | null, data: FormData) => {
      if (studentId) data.set("studentId", studentId);
      if (guardianUserId) data.set("guardianUserId", guardianUserId);
      const result = await linkGuardian(slug, data);
      if (result.ok) {
        success({ title: "Guardian linked." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;
  const boundParent = Boolean(guardianUserId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="size-4" aria-hidden="true" />
            {studentId ? "Add guardian" : "Link child"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{studentId ? "Add guardian" : "Link child"}</DialogTitle>
          <DialogDescription>
            {studentId
              ? "Link an existing parent account to this student."
              : "Link this parent to a student at the school."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          {boundParent ? <input type="hidden" name="guardianUserId" value={guardianUserId} /> : null}
          {!studentId && students ? (
            <Field id="g-student" label="Student" required error={fe?.studentId?.[0]}>
              <select
                id="g-student"
                name="studentId"
                required
                className={inputClasses}
                defaultValue=""
              >
                <option value="" disabled>
                  Select a student
                </option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                    {s.studentNo ? ` — ${s.studentNo}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {!boundParent ? (
            <Field
              id="g-guardian"
              label="Guardian account"
              required
              error={fe?.guardianUserId?.[0]}
            >
              <select
                id="g-guardian"
                name="guardianUserId"
                required
                className={inputClasses}
                defaultValue=""
              >
                <option value="" disabled>
                  Select a parent
                </option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ? `${p.name} — ${p.email}` : p.email}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <Field id="g-relationship" label="Relationship" error={fe?.relationship?.[0]}>
              <Input
                id="g-relationship"
                name="relationship"
                placeholder="Parent"
                defaultValue="Parent"
                className={inputClasses}
              />
            </Field>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="isPrimary" value="on" className="size-4" />
              Primary
            </label>
          </div>
          {failure?.error && !failure.fieldErrors ? (
            <p role="alert" className="text-sm text-destructive">{failure.error}</p>
          ) : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Linking…" : "Link"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewParentDialog({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof createParentUser>> | null, data: FormData) => {
      const result = await createParentUser(slug, data);
      if (result.ok) {
        success({ title: "Parent account ready." });
        setOpen(false);
      }
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New parent
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New parent</DialogTitle>
          <DialogDescription>
            Create (or reuse) a platform account with a parent role at this
            school.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="grid gap-4">
          <Field id="gp-name" label="Full name" required error={fe?.name?.[0]}>
            <Input id="gp-name" name="name" required className={inputClasses} />
          </Field>
          <Field id="gp-email" label="Email" required error={fe?.email?.[0]}>
            <Input
              id="gp-email"
              name="email"
              type="email"
              required
              placeholder="parent@example.com"
              className={inputClasses}
            />
          </Field>
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

export function GuardianRowActions({
  slug,
  guardian,
  canManage,
}: {
  slug: string;
  guardian: GuardianRowProps;
  canManage: boolean;
}) {
  const [busyPrimary, setBusyPrimary] = useState(false);
  const [busyUnlink, setBusyUnlink] = useState(false);

  if (!canManage) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {!guardian.isPrimary ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busyPrimary}
          onClick={async () => {
            setBusyPrimary(true);
            const result = await setPrimaryGuardian(
              slug,
              guardian.studentId,
              guardian.id
            );
            setBusyPrimary(false);
            if (result.ok) success({ title: "Primary guardian updated." });
          }}
        >
          Set primary
        </Button>
      ) : null}
      <ConfirmDialog
        trigger={
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        }
        title="Remove this guardian?"
        description="The parent link is removed from this student. The parent account and their link to other children are kept."
        confirmLabel="Remove"
        destructive
        busy={busyUnlink}
        onConfirm={async () => {
          setBusyUnlink(true);
          const result = await unlinkGuardian(slug, guardian.id);
          setBusyUnlink(false);
          if (result.ok) success({ title: "Guardian removed." });
          else if (result.error) success({ title: "Couldn’t remove", description: result.error });
        }}
      />
    </div>
  );
}