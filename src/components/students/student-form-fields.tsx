"use client";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

type FieldErrorsShown = Record<string, string[]> | undefined;

const inputClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";
const selectClasses =
  "flex h-9 w-full rounded-md border border-border bg-background px-2 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none";

export type StudentFormDefaults = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  studentNo: string | null;
  admissionDate: string;
  status: string;
  photoUrl: string | null;
  address: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  previousSchool: string | null;
  house: string | null;
};

export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  const p = new Date(d);
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${p.getFullYear()}-${tp(p.getMonth() + 1)}-${tp(p.getDate())}`;
}

export function StudentFormFields({
  fe,
  defaults,
}: {
  fe: FieldErrorsShown;
  defaults?: Partial<StudentFormDefaults>;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field id="sf-first" label="First name" required error={fe?.firstName?.[0]}>
          <Input
            id="sf-first"
            name="firstName"
            defaultValue={defaults?.firstName}
            required
            className={inputClasses}
          />
        </Field>
        <Field id="sf-last" label="Last name" required error={fe?.lastName?.[0]}>
          <Input
            id="sf-last"
            name="lastName"
            defaultValue={defaults?.lastName}
            required
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="sf-middle" label="Middle name" error={fe?.middleName?.[0]}>
          <Input
            id="sf-middle"
            name="middleName"
            defaultValue={defaults?.middleName ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="sf-gender" label="Gender" error={fe?.gender?.[0]}>
          <select
            id="sf-gender"
            name="gender"
            defaultValue={defaults?.gender ?? ""}
            className={selectClasses}
          >
            <option value="">Not set</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="sf-dob" label="Date of birth" error={fe?.dateOfBirth?.[0]}>
          <Input
            id="sf-dob"
            name="dateOfBirth"
            type="date"
            defaultValue={defaults?.dateOfBirth ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field id="sf-studentno" label="Admission number" error={fe?.studentNo?.[0]}>
          <Input
            id="sf-studentno"
            name="studentNo"
            defaultValue={defaults?.studentNo ?? undefined}
            placeholder="e.g. 2026-001"
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field id="sf-admission" label="Admission date" error={fe?.admissionDate?.[0]}>
          <Input
            id="sf-admission"
            name="admissionDate"
            type="date"
            defaultValue={defaults?.admissionDate ?? ""}
            className={inputClasses}
          />
        </Field>
        <Field id="sf-status" label="Status" error={fe?.status?.[0]}>
          <select
            id="sf-status"
            name="status"
            defaultValue={defaults?.status ?? "ACTIVE"}
            className={selectClasses}
          >
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </Field>
      </div>
      <Field id="sf-photo" label="Photo URL" error={fe?.photoUrl?.[0]}>
        <Input
          id="sf-photo"
          name="photoUrl"
          defaultValue={defaults?.photoUrl ?? undefined}
          className={inputClasses}
        />
      </Field>
      <Field id="sf-address" label="Address" error={fe?.address?.[0]}>
        <Input
          id="sf-address"
          name="address"
          defaultValue={defaults?.address ?? undefined}
          className={inputClasses}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="sf-phone" label="Phone" error={fe?.phone?.[0]}>
          <Input
            id="sf-phone"
            name="phone"
            defaultValue={defaults?.phone ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="sf-house" label="House / Category" error={fe?.house?.[0]}>
          <Input
            id="sf-house"
            name="house"
            defaultValue={defaults?.house ?? undefined}
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="sf-emergency-name"
          label="Emergency contact name"
          error={fe?.emergencyContactName?.[0]}
        >
          <Input
            id="sf-emergency-name"
            name="emergencyContactName"
            defaultValue={defaults?.emergencyContactName ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field
          id="sf-emergency-phone"
          label="Emergency contact phone"
          error={fe?.emergencyContactPhone?.[0]}
        >
          <Input
            id="sf-emergency-phone"
            name="emergencyContactPhone"
            defaultValue={defaults?.emergencyContactPhone ?? undefined}
            className={inputClasses}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="sf-emergency-relation"
          label="Relationship"
          error={fe?.emergencyContactRelation?.[0]}
        >
          <Input
            id="sf-emergency-relation"
            name="emergencyContactRelation"
            defaultValue={defaults?.emergencyContactRelation ?? undefined}
            className={inputClasses}
          />
        </Field>
        <Field id="sf-prev-school" label="Previous school" error={fe?.previousSchool?.[0]}>
          <Input
            id="sf-prev-school"
            name="previousSchool"
            defaultValue={defaults?.previousSchool ?? undefined}
            className={inputClasses}
          />
        </Field>
      </div>
    </div>
  );
}