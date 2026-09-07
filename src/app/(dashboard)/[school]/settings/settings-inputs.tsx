"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function inputClasses(error?: boolean) {
  return [
    "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors",
    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    error ? "border-destructive" : "",
  ].join(" ");
}

export function SettingsInput(props: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  type?: string;
  inputMode?: "email" | "tel" | "url" | "numeric" | "text";
  pattern?: string;
  placeholder?: string;
  className?: string;
}) {
  const { error, className, ...inputProps } = props;
  return (
    <Field
      id={props.id}
      label={props.label}
      required={props.required}
      error={error}
      hint={props.hint}
      className={className}
    >
      <Input {...inputProps} aria-invalid={!!error} className={inputClasses(!!error)} />
    </Field>
  );
}

export function SettingsSelect(props: {
  id: string;
  name: string;
  label: string;
  value: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field
      id={props.id}
      label={props.label}
      error={props.error}
      hint={props.hint}
      className={props.className}
    >
      <Select name={props.name} value={props.value} disabled={props.disabled}>
        <SelectTrigger aria-invalid={!!props.error} className={inputClasses(!!props.error)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function SettingsFooter({
  isPending,
  disabled,
  resetLabel,
}: {
  isPending: boolean;
  disabled: boolean;
  resetLabel?: string;
}) {
  if (disabled) return null;
  return (
    <div className="mt-6 flex justify-end gap-2">
      {resetLabel ? (
        <Button type="reset" variant="outline" disabled={isPending}>
          {resetLabel}
        </Button>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

export const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (€)" },
  { value: "GBP", label: "GBP (£)" },
  { value: "KES", label: "KES (KSh)" },
  { value: "NGN", label: "NGN (₦)" },
  { value: "ZAR", label: "ZAR (R)" },
];

export const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "Africa/Nairobi", label: "Africa/Nairobi (EAT)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (WAT)" },
  { value: "Africa/Johannesburg", label: "Africa/Johannesburg (SAST)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
];