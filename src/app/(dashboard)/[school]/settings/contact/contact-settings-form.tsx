"use client";

import { useActionState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateContactSettings } from "@/server/actions/settings";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import { SettingsInput, SettingsFooter } from "../settings-inputs";

export function ContactSettingsForm({
  slug,
  school,
  disabled,
}: {
  slug: string;
  school: { email: string; phone: string; address: string };
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateContactSettings>> | null, data: FormData) => {
      const result = await updateContactSettings(slug, data);
      if (result.ok) success({ title: "Contact information saved." });
      return result;
    },
    null
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact information</CardTitle>
          <CardDescription>
            Public contact details shown for this school.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput
            id="contact-email"
            name="email"
            label="Email"
            type="email"
            inputMode="email"
            defaultValue={school.email}
            disabled={disabled}
            error={fe?.email?.[0]}
          />

          <SettingsInput
            id="contact-phone"
            name="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            defaultValue={school.phone}
            disabled={disabled}
            error={fe?.phone?.[0]}
          />

          <SettingsInput
            id="contact-address"
            name="address"
            label="Address"
            defaultValue={school.address}
            disabled={disabled}
            error={fe?.address?.[0]}
            className="sm:col-span-2"
            placeholder="e.g. 123 Main Street, City, Country"
          />
        </CardContent>
      </Card>

      {failure?.error && !failure.fieldErrors && (
        <p role="alert" className="mt-4 text-sm text-destructive">{failure.error}</p>
      )}

      <SettingsFooter isPending={isPending} disabled={disabled} resetLabel="Reset form" />
    </form>
  );
}