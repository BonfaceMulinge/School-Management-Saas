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

import { updateFinanceSettings } from "@/server/actions/settings";
import type { SchoolSettingsValues } from "@/lib/settings-types";
import { success } from "@/components/ui/use-toast";
import { failureOf } from "@/lib/action-result";

import {
  SettingsInput,
  SettingsSelect,
  SettingsFooter,
  CURRENCY_OPTIONS,
} from "../settings-inputs";

export function FinanceSettingsForm({
  slug,
  currency,
  settings,
  disabled,
}: {
  slug: string;
  currency: string;
  settings: SchoolSettingsValues;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: Awaited<ReturnType<typeof updateFinanceSettings>> | null, data: FormData) => {
      const result = await updateFinanceSettings(slug, data);
      if (result.ok) success({ title: "Finance settings saved." });
      return result;
    },
    null
  );

  const [autoIncrement, setAutoIncrement] = useState(
    settings.receiptNumbering.autoIncrement
  );

  const failure = failureOf(state);
  const fe = failure?.fieldErrors;

  return (
    <form action={formAction} noValidate>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Currency</CardTitle>
            <CardDescription>
              The currency used when money amounts are shown for this school.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsSelect
              id="finance-currency"
              name="currency"
              label="Currency"
              value={currency}
              disabled={disabled}
              error={fe?.currency?.[0]}
              options={CURRENCY_OPTIONS}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipt numbering</CardTitle>
            <CardDescription>
              How receipt numbers are generated for this school.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SettingsInput
              id="finance-receiptPrefix"
              name="receiptPrefix"
              label="Receipt prefix"
              defaultValue={settings.receiptNumbering.prefix}
              disabled={disabled}
              error={fe?.receiptPrefix?.[0]}
            />

            <SettingsInput
              id="finance-receiptPadding"
              name="receiptPadding"
              label="Number padding"
              type="number"
              inputMode="numeric"
              defaultValue={String(settings.receiptNumbering.padding)}
              disabled={disabled}
              error={fe?.receiptPadding?.[0]}
              hint="e.g. 4 → REC-0001"
            />

            <SettingsInput
              id="finance-receiptNextNumber"
              name="receiptNextNumber"
              label="Next number"
              type="number"
              inputMode="numeric"
              defaultValue={String(settings.receiptNumbering.nextNumber)}
              disabled={disabled}
              error={fe?.receiptNextNumber?.[0]}
              className="sm:col-span-2"
            />

            <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Auto-increment</p>
                <p className="text-xs text-muted-foreground">
                  Automatically advance the next number after each receipt.
                </p>
              </div>
              <div>
                <input type="hidden" name="receiptAutoIncrement" value={autoIncrement ? "on" : ""} />
                <Switch
                  checked={autoIncrement}
                  onCheckedChange={setAutoIncrement}
                  disabled={disabled}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Finance preferences</CardTitle>
            <CardDescription>
              Defaults used on invoices and receipts produced by this school.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SettingsInput
              id="finance-invoicePrefix"
              name="invoicePrefix"
              label="Invoice prefix"
              defaultValue={settings.financeSettings.invoicePrefix}
              disabled={disabled}
              error={fe?.invoicePrefix?.[0]}
            />

            <SettingsInput
              id="finance-receiptNote"
              name="receiptNote"
              label="Receipt note"
              defaultValue={settings.financeSettings.receiptNote}
              disabled={disabled}
              error={fe?.receiptNote?.[0]}
              hint="Optional message printed on receipts."
            />
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