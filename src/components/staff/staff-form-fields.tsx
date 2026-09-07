"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";

type FieldErrorsShown = Record<string, string[]> | undefined;

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type StaffFormDefaults = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  staffNo: string | null;
  role: string;
  phone: string | null;
  dateJoined: string;
  department: string | null;
  position: string | null;
  status: string;
};

export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const p = new Date(d);
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${p.getFullYear()}-${tp(p.getMonth() + 1)}-${tp(p.getDate())}`;
}

export type StaffAccountSection = {
  toggleName: string; // form field name of the account toggle
  toggleLabel: string;
  defaultOn: boolean;
  emailDefault: string;
  hint?: string;
};

export function StaffFormFields({
  fe,
  defaults,
  account,
}: {
  fe: FieldErrorsShown;
  defaults?: Partial<StaffFormDefaults>;
  account?: StaffAccountSection;
}) {
  const [wantAccount, setWantAccount] = useState(account?.defaultOn ?? false);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field id="st-first" label="First name" required error={fe?.firstName?.[0]}>
          <Input
            id="st-first"
            name="firstName"
            defaultValue={defaults?.firstName}
            required
            className={inputClasses}
          />
        </Field>
        <Field id="st-last" label="Last name" required error={fe?.lastName?.[0]}>
          <Input
            id="st-last"
            name="lastName"
            defaultValue={defaults?.lastName}
            required
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="st-middle" label="Middle name" error={fe?.middleName?.[0]}>
          <Input
            id="st-middle"
            name="middleName"
            defaultValue={defaults?.middleName ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="st-staffno" label="Staff number" error={fe?.staffNo?.[0]}>
          <Input
            id="st-staffno"
            name="staffNo"
            defaultValue={defaults?.staffNo ?? undefined}
            placeholder="e.g. EMP-001"
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="st-role" label="Role" error={fe?.role?.[0]}>
          <select
            id="st-role"
            name="role"
            defaultValue={defaults?.role ?? "TEACHER"}
            className={selectClasses}
          >
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School Administrator</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="SUPPORT_STAFF">Support Staff</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field id="st-status" label="Status" error={fe?.status?.[0]}>
          <select
            id="st-status"
            name="status"
            defaultValue={defaults?.status ?? "ACTIVE"}
            className={selectClasses}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="st-phone" label="Phone" error={fe?.phone?.[0]}>
          <Input
            id="st-phone"
            name="phone"
            defaultValue={defaults?.phone ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="st-joined" label="Date joined" error={fe?.dateJoined?.[0]}>
          <Input
            id="st-joined"
            name="dateJoined"
            type="date"
            defaultValue={defaults?.dateJoined ?? ""}
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="st-department" label="Department" error={fe?.department?.[0]}>
          <Input
            id="st-department"
            name="department"
            defaultValue={defaults?.department ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="st-position" label="Position / title" error={fe?.position?.[0]}>
          <Input
            id="st-position"
            name="position"
            defaultValue={defaults?.position ?? undefined}
            className={inputClasses}
          />
        </Field>
      </div>

      {account ? (
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <input type="hidden" name={account.toggleName} value={wantAccount ? "on" : ""} />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{account.toggleLabel}</p>
              {account.hint ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{account.hint}</p>
              ) : null}
            </div>
            <Switch
              checked={wantAccount}
              onCheckedChange={setWantAccount}
              aria-label={account.toggleLabel}
            />
          </div>
          {wantAccount ? (
            <Field
              id="st-account-email"
              label="Account email"
              required
              error={fe?.accountEmail?.[0]}
            >
              <Input
                id="st-account-email"
                name="accountEmail"
                type="email"
                autoComplete="email"
                defaultValue={account.emailDefault}
                placeholder="e.g. jane.doe@example.com"
                className={inputClasses}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}