"use client";

import { useActionState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateBrandingSettings } from "@/server/actions/settings";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import { SettingsInput, SettingsFooter } from "../settings-inputs";

export function BrandingSettingsForm({
  slug,
  school,
  disabled,
}: {
  slug: string;
  school: { motto: string; website: string; logoUrl: string; primaryColor: string };
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateBrandingSettings>> | null, data: FormData) => {
      const result = await updateBrandingSettings(slug, data);
      if (result.ok) success({ title: "Branding saved." });
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
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>
            Motto, logo and the brand colour used across this school&apos;s pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput
            id="branding-motto"
            name="motto"
            label="Motto"
            defaultValue={school.motto}
            disabled={disabled}
            error={fe?.motto?.[0]}
            className="sm:col-span-2"
            placeholder="e.g. Knowledge is Power"
          />

          <SettingsInput
            id="branding-logoUrl"
            name="logoUrl"
            label="Logo URL"
            type="url"
            inputMode="url"
            defaultValue={school.logoUrl}
            disabled={disabled}
            error={fe?.logoUrl?.[0]}
            hint="Public URL of the school logo image."
          />

          <SettingsInput
            id="branding-primaryColor"
            name="primaryColor"
            label="Primary colour"
            defaultValue={school.primaryColor}
            disabled={disabled}
            error={fe?.primaryColor?.[0]}
            hint="#rrggbb"
            pattern="^#[0-9a-fA-F]{6}$"
          />

          <SettingsInput
            id="branding-website"
            name="website"
            label="Website"
            type="url"
            inputMode="url"
            defaultValue={school.website}
            disabled={disabled}
            error={fe?.website?.[0]}
            className="sm:col-span-2"
            placeholder="https://school.example.com"
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