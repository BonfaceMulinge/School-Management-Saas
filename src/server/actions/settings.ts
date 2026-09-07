"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { createAuditLog } from "@/server/services/audit-log";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  FIRST_DAY_OPTIONS,
  AUDIENCE_OPTIONS,
} from "@/lib/settings-types";
import { Prisma } from "@/generated/prisma/client";

function checkboxOn(input: FormData, name: string): boolean {
  return input.get(name) === "on" || input.get(name) === "true";
}

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a hex colour like #2563eb.");

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3,10}$/, "Enter a 3–10 letter currency code (e.g. USD).");

async function ensureSettingsRow(schoolId: string) {
  return db.schoolSettings.upsert({
    where: { schoolId },
    update: {},
    create: { schoolId },
  });
}

async function auditSettingsChange(access: { schoolId: string; user: { id: string } }, section: string, fields: string[]) {
  await createAuditLog({
    actorId: access.user.id,
    schoolId: access.schoolId,
    action: "SETTINGS_CHANGE",
    entity: "SchoolSettings",
    entityId: access.schoolId,
    metadata: { section, fields },
  });
}

// ---------------------------------------------------------------------------
// General — school identity + display preferences.
// ---------------------------------------------------------------------------

const generalSchema = z.object({
  name: z.string().trim().min(1, "School name is required.").max(120),
  timezone: z.string().trim().min(1, "Timezone is required.").max(64),
  dateFormat: z.string().min(1).refine((v) => DATE_FORMAT_OPTIONS.some((o) => o.value === v), "Invalid date format."),
  timeFormat: z.string().min(1).refine((v) => TIME_FORMAT_OPTIONS.some((o) => o.value === v), "Invalid time format."),
  firstDayOfWeek: z.string().min(1).refine((v) => FIRST_DAY_OPTIONS.some((o) => o.value === v), "Invalid first day of week."),
});

export async function updateGeneralSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = generalSchema.safeParse({
    name: input.get("name"),
    timezone: input.get("timezone"),
    dateFormat: input.get("dateFormat"),
    timeFormat: input.get("timeFormat"),
    firstDayOfWeek: input.get("firstDayOfWeek"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.school.update({
      where: { id: access.schoolId },
      data: { name: data.name, timezone: data.timezone },
    });
    const row = await tx.schoolSettings.findUnique({ where: { schoolId: access.schoolId } });
    if (!row) {
      await tx.schoolSettings.create({
        data: {
          schoolId: access.schoolId,
          dateFormat: data.dateFormat,
          timeFormat: data.timeFormat,
          firstDayOfWeek: data.firstDayOfWeek,
        },
      });
    } else {
      await tx.schoolSettings.update({
        where: { id: row.id },
        data: {
          dateFormat: data.dateFormat,
          timeFormat: data.timeFormat,
          firstDayOfWeek: data.firstDayOfWeek,
        },
      });
    }
  });

  await auditSettingsChange(access, "general", [
    "name",
    "timezone",
    "dateFormat",
    "timeFormat",
    "firstDayOfWeek",
  ]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}

// ---------------------------------------------------------------------------
// Branding — motto, website, logo, primary colour.
// ---------------------------------------------------------------------------

const brandingSchema = z.object({
  motto: z.string().trim().max(200).optional().or(z.literal("")),
  website: z.union([z.url({ error: "Enter a valid website URL." }), z.literal("")]).optional(),
  logoUrl: z.union([z.url({ error: "Enter a valid logo URL." }), z.literal("")]).optional(),
  primaryColor: hexColorSchema,
});

export async function updateBrandingSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = brandingSchema.safeParse({
    motto: input.get("motto"),
    website: input.get("website"),
    logoUrl: input.get("logoUrl"),
    primaryColor: input.get("primaryColor"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  await db.school.update({
    where: { id: access.schoolId },
    data: {
      motto: data.motto || null,
      website: data.website || null,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor,
    },
  });

  await auditSettingsChange(access, "branding", ["motto", "website", "logoUrl", "primaryColor"]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}

// ---------------------------------------------------------------------------
// Contact information.
// ---------------------------------------------------------------------------

const contactSchema = z.object({
  email: z.union([z.email({ error: "Enter a valid email address." }), z.literal("")]).optional(),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function updateContactSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = contactSchema.safeParse({
    email: input.get("email"),
    phone: input.get("phone"),
    address: input.get("address"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  await db.school.update({
    where: { id: access.schoolId },
    data: {
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
    },
  });

  await auditSettingsChange(access, "contact", ["email", "phone", "address"]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}

// ---------------------------------------------------------------------------
// Academic — default academic settings.
// ---------------------------------------------------------------------------

const academicSchema = z.object({
  termLengthDays: z.coerce.number().int().min(1, "Term length must be at least 1 day.").max(365, "Term length must be at most 365 days."),
});

export async function updateAcademicSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = academicSchema.safeParse({
    termLengthDays: input.get("termLengthDays"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const row = await ensureSettingsRow(access.schoolId);
  await db.schoolSettings.update({
    where: { id: row.id },
    data: {
      defaultAcademicSettings: {
        termLengthDays: data.termLengthDays,
      } as Prisma.InputJsonValue,
    },
  });

  await auditSettingsChange(access, "academic", ["termLengthDays"]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}

// ---------------------------------------------------------------------------
// Communication — communication + notification preferences.
// ---------------------------------------------------------------------------

const communicationSchema = z.object({
  contactEmail: z.union([z.email({ error: "Enter a valid email address." }), z.literal("")]).optional(),
  defaultAudience: z.string().min(1).refine((v) => AUDIENCE_OPTIONS.some((o) => o.value === v), "Invalid audience."),
});

const NOTIFICATION_KEYS = [
  "announcement",
  "message",
  "feePayment",
  "feeReminder",
  "resultsPublished",
  "attendanceAlert",
  "schoolEvent",
] as const;

export async function updateCommunicationSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = communicationSchema.safeParse({
    contactEmail: input.get("contactEmail"),
    defaultAudience: input.get("defaultAudience"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const notifications = {} as Record<string, boolean>;
  for (const key of NOTIFICATION_KEYS) {
    notifications[key] = checkboxOn(input, `notify.${key}`);
  }

  const row = await ensureSettingsRow(access.schoolId);
  await db.schoolSettings.update({
    where: { id: row.id },
    data: {
      communicationPreferences: {
        contactEmail: data.contactEmail || "",
        defaultAudience: data.defaultAudience,
      } as Prisma.InputJsonValue,
      notificationPreferences: notifications as Prisma.InputJsonValue,
    },
  });

  await auditSettingsChange(access, "communication", [
    "contactEmail",
    "defaultAudience",
    ...NOTIFICATION_KEYS.map((k) => `notification.${k}`),
  ]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}

// ---------------------------------------------------------------------------
// Finance — currency, receipt numbering, finance preferences.
// ---------------------------------------------------------------------------

const financeSchema = z.object({
  currency: currencySchema,
  receiptPrefix: z.string().trim().min(1, "Receipt prefix is required.").max(10),
  receiptPadding: z.coerce.number().int().min(1, "Padding must be at least 1.").max(10, "Padding must be at most 10."),
  receiptNextNumber: z.coerce.number().int().min(0, "Next number must be non-negative.").max(9999999999),
  receiptAutoIncrement: z.boolean().optional(),
  invoicePrefix: z.string().trim().min(1, "Invoice prefix is required.").max(10),
  receiptNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function updateFinanceSettings(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = financeSchema.safeParse({
    currency: input.get("currency"),
    receiptPrefix: input.get("receiptPrefix"),
    receiptPadding: input.get("receiptPadding"),
    receiptNextNumber: input.get("receiptNextNumber"),
    receiptAutoIncrement: input.get("receiptAutoIncrement"),
    invoicePrefix: input.get("invoicePrefix"),
    receiptNote: input.get("receiptNote"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const row = await ensureSettingsRow(access.schoolId);
  const receiptNumbering = {
    prefix: data.receiptPrefix,
    padding: data.receiptPadding,
    nextNumber: data.receiptNextNumber,
    autoIncrement: !!data.receiptAutoIncrement,
  };
  await db.$transaction(async (tx) => {
    await tx.school.update({
      where: { id: access.schoolId },
      data: { currency: data.currency },
    });
    await tx.schoolSettings.update({
      where: { id: row.id },
      data: {
        receiptNumbering: receiptNumbering as Prisma.InputJsonValue,
        financeSettings: {
          invoicePrefix: data.invoicePrefix,
          receiptNote: data.receiptNote || "",
        } as Prisma.InputJsonValue,
      },
    });
  });

  await auditSettingsChange(access, "finance", [
    "currency",
    "receiptNumbering",
    "invoicePrefix",
    "receiptNote",
  ]);
  revalidatePath(`/${schoolSlug}/settings`);
  return ok();
}