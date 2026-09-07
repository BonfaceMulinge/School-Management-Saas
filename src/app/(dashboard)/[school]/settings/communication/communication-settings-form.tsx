"use client";

import { useActionState, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { updateCommunicationSettings } from "@/server/actions/settings";
import type { SchoolSettingsValues } from "@/lib/settings-types";
import { AUDIENCE_OPTIONS } from "@/lib/settings-types";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import {
  SettingsInput,
  SettingsSelect,
  SettingsFooter,
} from "../settings-inputs";

type NotificationKey = keyof SchoolSettingsValues["notificationPreferences"];

const NOTIFICATION_ITEMS: Array<{
  key: NotificationKey;
  label: string;
  description: string;
}> = [
  { key: "announcement", label: "Announcements", description: "When a new announcement is published." },
  { key: "message", label: "Direct messages", description: "When a new message arrives in a conversation." },
  { key: "feePayment", label: "Fee payments", description: "When a fee payment is recorded for your students." },
  { key: "feeReminder", label: "Fee reminders", description: "When a fee reminder is raised." },
  { key: "resultsPublished", label: "Published results", description: "When exam results are published." },
  { key: "schoolEvent", label: "School events", description: "When a new school event is scheduled." },
];

export function CommunicationSettingsForm({
  slug,
  settings,
  disabled,
}: {
  slug: string;
  settings: SchoolSettingsValues;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateCommunicationSettings>> | null, data: FormData) => {
      const result = await updateCommunicationSettings(slug, data);
      if (result.ok) success({ title: "Communication settings saved." });
      return result;
    },
    null
  );

  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    ...settings.notificationPreferences,
  });

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <form action={formAction} noValidate>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Communication</CardTitle>
            <CardDescription>
              Defaults for announcements and messaging.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SettingsInput
              id="communication-contactEmail"
              name="contactEmail"
              label="Contact email"
              type="email"
              inputMode="email"
              defaultValue={settings.communicationPreferences.contactEmail}
              disabled={disabled}
              error={fe?.contactEmail?.[0]}
              hint="Reply-to address used when the school contacts people."
            />

            <SettingsSelect
              id="communication-defaultAudience"
              name="defaultAudience"
              label="Default announcement audience"
              value={settings.communicationPreferences.defaultAudience}
              disabled={disabled}
              error={fe?.defaultAudience?.[0]}
              options={AUDIENCE_OPTIONS}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>
              Which in-app notifications this school wants enabled. These are
              preferences only — deliverable providers are configured elsewhere.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1.5">
            {NOTIFICATION_ITEMS.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <div>
                  <input type="hidden" name={`notify.${item.key}`} value={notifications[item.key] ? "on" : ""} />
                  <Switch
                    checked={notifications[item.key]}
                    onCheckedChange={(on) => setNotifications((prev) => ({ ...prev, [item.key]: on }))}
                    disabled={disabled}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {failure?.error && !failure.fieldErrors && (
        <p role="alert" className="mt-4 text-sm text-destructive">{failure.error}</p>
      )}

      <SettingsFooter isPending={isPending} disabled={disabled} resetLabel="Reset form" />
    </form>
  );
}