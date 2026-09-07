"use client";

import { useActionState } from "react";

import { login } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(login, null);

  const emailError = state?.fieldErrors?.email?.[0];
  const passwordError = state?.fieldErrors?.password?.[0];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <CardTitle>Sign in to {APP_NAME}</CardTitle>
        <CardDescription>
          Enter your email and password to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="grid gap-4">
          <input type="hidden" name="next" value={next ?? ""} />

          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              autoFocus
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? "email-error" : undefined}
              className={cn(inputClasses, emailError && "border-destructive")}
            />
            {emailError ? (
              <p id="email-error" role="alert" className="text-sm text-destructive">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={
                passwordError
                  ? "password-error"
                  : state?.error
                    ? "form-error"
                    : undefined
              }
              className={cn(inputClasses, passwordError && "border-destructive")}
            />
            {passwordError ? (
              <p id="password-error" role="alert" className="text-sm text-destructive">
                {passwordError}
              </p>
            ) : null}
          </div>

          {state?.error ? (
            <p id="form-error" role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={isPending}>
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}