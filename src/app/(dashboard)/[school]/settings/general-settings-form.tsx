"use client";

import { useActionState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateGeneralSettings } from "@/server/actions/settings";
import type { SchoolSettingsValues } from "@/lib/settings-types";
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  FIRST_DAY_OPTIONS,
} from "@/lib/settings-types";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import {
  SettingsInput,
  SettingsSelect,
  SettingsFooter,
  TIMEZONE_OPTIONS,
} from "./settings-inputs";

export function GeneralSettingsForm({
  slug,
  school,
  settings,
  disabled,
}: {
  slug: string;
  school: { name: string; timezone: string };
  settings: SchoolSettingsValues;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateGeneralSettings>> | null, data: FormData) => {
      const result = await updateGeneralSettings(slug, data);
      if (result.ok) success({ title: "General settings saved." });
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
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>
            School identity, timezone and display preferences.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SettingsInput
            id="general-name"
            name="name"
            label="School name"
            required
            defaultValue={school.name}
            disabled={disabled}
            error={fe?.name?.[0]}
            className="sm:col-span-2"
          />

          <SettingsSelect
            id="general-timezone"
            name="timezone"
            label="Timezone"
            value={school.timezone}
            disabled={disabled}
            error={fe?.timezone?.[0]}
            options={TIMEZONE_OPTIONS}
          />

          <SettingsSelect
            id="general-dateFormat"
            name="dateFormat"
            label="Date format"
            value={settings.dateFormat}
            disabled={disabled}
            error={fe?.dateFormat?.[0]}
            hint="How dates are shown in this school's screens."
            options={DATE_FORMAT_OPTIONS}
          />

          <SettingsSelect
            id="general-timeFormat"
            name="timeFormat"
            label="Time format"
            value={settings.timeFormat}
            disabled={disabled}
            error={fe?.timeFormat?.[0]}
            options={TIME_FORMAT_OPTIONS}
          />

          <SettingsSelect
            id="general-firstDayOfWeek"
            name="firstDayOfWeek"
            label="First day of the week"
            value={settings.firstDayOfWeek}
            disabled={disabled}
            error={fe?.firstDayOfWeek?.[0]}
            options={FIRST_DAY_OPTIONS}
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