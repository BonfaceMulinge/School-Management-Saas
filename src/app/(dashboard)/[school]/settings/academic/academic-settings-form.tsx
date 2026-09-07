"use client";

import { useActionState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateAcademicSettings } from "@/server/actions/settings";
import type { SchoolSettingsValues } from "@/lib/settings-types";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import {
  SettingsInput,
  SettingsFooter,
} from "../settings-inputs";

export function AcademicSettingsForm({
  slug,
  settings,
  disabled,
}: {
  slug: string;
  settings: SchoolSettingsValues;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateAcademicSettings>> | null, data: FormData) => {
      const result = await updateAcademicSettings(slug, data);
      if (result.ok) success({ title: "Academic settings saved." });
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
          <CardTitle className="text-base">Default academic settings</CardTitle>
          <CardDescription>
            Defaults applied when new academic records are created. The academic
            structure itself (years, terms, classes, streams, subjects) is managed
            from its own pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput
            id="academic-termLengthDays"
            name="termLengthDays"
            label="Default term length (days)"
            type="number"
            inputMode="numeric"
            defaultValue={String(settings.defaultAcademicSettings.termLengthDays)}
            disabled={disabled}
            error={fe?.termLengthDays?.[0]}
            hint="Suggested length of a new term (1–365)."
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