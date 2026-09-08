"use client";

import { useActionState } from "react";

import { changeFirstLoginPassword, type LoginState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

export function FirstLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    changeFirstLoginPassword,
    null
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="grid gap-2 text-sm font-medium">
        New password
        <input
          name="newPassword"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="h-10 rounded-md border border-border bg-background px-3"
        />
        {state?.fieldErrors?.newPassword?.[0] ? (
          <span className="font-normal text-destructive">{state.fieldErrors.newPassword[0]}</span>
        ) : null}
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="h-10 rounded-md border border-border bg-background px-3"
        />
        {state?.fieldErrors?.confirmPassword?.[0] ? (
          <span className="font-normal text-destructive">{state.fieldErrors.confirmPassword[0]}</span>
        ) : null}
      </label>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating password..." : "Set password and continue"}
      </Button>
    </form>
  );
}