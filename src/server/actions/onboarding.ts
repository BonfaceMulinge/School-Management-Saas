"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { createAuditLog } from "@/server/services/audit-log";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { ONBOARDING_STEPS } from "@/lib/settings-types";
import { createAcademicYear } from "@/server/actions/academic-years";
import { createTerm } from "@/server/actions/terms";
import { setActiveAcademicYear } from "@/server/actions/academic-years";
import { setActiveTerm } from "@/server/actions/terms";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Enter a hex colour like #2563eb.");

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3,10}$/, "Enter a 3–10 letter currency code (e.g. USD).");

const profileSchema = z.object({
  name: z.string().trim().min(1, "School name is required.").max(120),
  motto: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.union([z.email({ error: "Enter a valid email address." }), z.literal("")]).optional(),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  website: z.union([z.url({ error: "Enter a valid website URL." }), z.literal("")]).optional(),
  logoUrl: z.union([z.url({ error: "Enter a valid logo URL." }), z.literal("")]).optional(),
  primaryColor: hexColorSchema,
  currency: currencySchema,
  timezone: z.string().trim().min(1, "Timezone is required.").max(64),
});

async function latestStep(schoolId: string) {
  const row = await db.schoolOnboarding.findUnique({
    where: { schoolId },
    select: { currentStep: true },
  });
  return row?.currentStep ?? 5;
}

async function setStep(schoolId: string, next: number) {
  await db.schoolOnboarding.updateMany({
    where: { schoolId, completed: false },
    data: { currentStep: Math.min(Math.max(1, next), ONBOARDING_STEPS) },
  });
}

async function auditStep(access: { schoolId: string; user: { id: string } }, step: number, stage: string, extra?: Record<string, unknown>) {
  await createAuditLog({
    actorId: access.user.id,
    schoolId: access.schoolId,
    action: "ONBOARDING_STEP",
    entity: "School",
    entityId: access.schoolId,
    metadata: { step, stage, ...(extra ?? {}) },
  });
}

function revalidateOnboarding(slug: string, extra: string[]) {
  revalidatePath(`/${slug}/onboarding`);
  for (const p of extra) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Step 1 — School profile.
// ---------------------------------------------------------------------------

export async function saveOnboardingProfile(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = profileSchema.safeParse({
    name: input.get("name"),
    motto: input.get("motto"),
    email: input.get("email"),
    phone: input.get("phone"),
    address: input.get("address"),
    website: input.get("website"),
    logoUrl: input.get("logoUrl"),
    primaryColor: input.get("primaryColor"),
    currency: input.get("currency"),
    timezone: input.get("timezone"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  await db.school.update({
    where: { id: access.schoolId },
    data: {
      name: data.name,
      motto: data.motto || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      website: data.website || null,
      logoUrl: data.logoUrl || null,
      primaryColor: data.primaryColor,
      currency: data.currency,
      timezone: data.timezone,
    },
  });
  await setStep(access.schoolId, 2);
  await auditStep(access, 1, "profile", {
    fields: ["name", "motto", "email", "phone", "address", "website", "logoUrl", "primaryColor", "currency", "timezone"],
  });
  revalidateOnboarding(schoolSlug, [`/${schoolSlug}/settings`]);
  return ok();
}

// ---------------------------------------------------------------------------
// Step 2 — Initial academic year + optional term.
// Reuses the existing academic-year/term actions so duplicate-name and overlap
// guards (and tenant scoping) are the same ones used on the real pages.
// ---------------------------------------------------------------------------

const academicsSchema = z.object({
  yearName: z.string().trim().min(1, "Academic year name is required.").max(120),
  yearStart: z.coerce.date({ error: "Start date is required." }),
  yearEnd: z.coerce.date({ error: "End date is required." }),
  includeTerm: z.string().optional(),
  termName: z.string().trim().max(120).optional().or(z.literal("")),
  termStart: z.coerce.date().optional(),
  termEnd: z.coerce.date().optional(),
});

export async function saveOnboardingAcademics(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = academicsSchema.safeParse({
    yearName: input.get("yearName"),
    yearStart: input.get("yearStart"),
    yearEnd: input.get("yearEnd"),
    includeTerm: input.get("includeTerm") || undefined,
    termName: input.get("termName"),
    termStart: input.get("termStart") || undefined,
    termEnd: input.get("termEnd") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;
  if (data.yearEnd <= data.yearStart) {
    return fail("End date must be after the start date.", {
      yearEnd: ["End date must be after the start date."],
    });
  }

  const yearForm = new FormData();
  yearForm.set("name", data.yearName);
  yearForm.set("startDate", data.yearStart.toISOString());
  yearForm.set("endDate", data.yearEnd.toISOString());
  const yearResult = await createAcademicYear(schoolSlug, yearForm);
  if (!yearResult.ok || !yearResult.data) return yearResult;

  await setActiveAcademicYear(schoolSlug, yearResult.data.id);

  const wantTerm =
    (input.get("includeTerm") === "on" || input.get("includeTerm") === "true") &&
    (data.termName || data.termStart || data.termEnd);

  if (wantTerm) {
    if (!data.termName || !data.termStart || !data.termEnd) {
      return fail("Provide a name and dates for the term, or leave the term out.", {
        termName: ["Required when adding an initial term."],
      });
    }
    if (data.termEnd <= data.termStart) {
      return fail("Term end date must be after the term start date.", {
        termEnd: ["Term end date must be after the term start date."],
      });
    }
    const termForm = new FormData();
    termForm.set("academicYearId", yearResult.data.id);
    termForm.set("name", data.termName);
    termForm.set("startDate", data.termStart.toISOString());
    termForm.set("endDate", data.termEnd.toISOString());
    const termResult = await createTerm(schoolSlug, termForm);
    if (!termResult.ok || !termResult.data) return termResult;
    await setActiveTerm(schoolSlug, termResult.data.id);
  }

  await setStep(access.schoolId, 3);
  await auditStep(access, 2, "academics", { yearId: yearResult.data.id, termIncluded: wantTerm });
  revalidateOnboarding(schoolSlug, [
    `/${schoolSlug}/academic-years`,
    `/${schoolSlug}/terms`,
  ]);
  return ok();
}

// ---------------------------------------------------------------------------
// Step advance / finish. Steps 3 (classes & streams) and 4 (subjects) create
// records directly through the existing class/stream/subject actions from the
// onboarding page; the "Continue"/"Skip" controls move the step forward. The
// final step marks setup complete.
// ---------------------------------------------------------------------------

export async function advanceOnboardingStep(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "settings:manage");

  const parsed = z
    .object({
      to: z.coerce.number().int().min(2).max(ONBOARDING_STEPS),
    })
    .safeParse({ to: input.get("to") });
  if (!parsed.success) return fail("Invalid step.");

  const current = await latestStep(access.schoolId);
  const next = Math.min(parsed.data.to, ONBOARDING_STEPS);
  if (next <= current) {
    return fail("That onboarding step is already complete.");
  }

  await setStep(access.schoolId, next);
  await auditStep(access, next, "advance", { from: current });
  revalidateOnboarding(schoolSlug, []);
  return ok();
}

export async function finishOnboarding(
  schoolSlug: string,
  _input: FormData
): Promise<ActionResult> {
  void _input;
  const access = await assertPermission(schoolSlug, "settings:manage");

  await db.schoolOnboarding.upsert({
    where: { schoolId: access.schoolId },
    update: { completed: true, completedAt: new Date(), currentStep: ONBOARDING_STEPS },
    create: { schoolId: access.schoolId, completed: true, completedAt: new Date(), currentStep: ONBOARDING_STEPS },
  });

  await createAuditLog({
    actorId: access.user.id,
    schoolId: access.schoolId,
    action: "ONBOARDING_STEP",
    entity: "School",
    entityId: access.schoolId,
    metadata: { step: ONBOARDING_STEPS, stage: "complete" },
  });

  revalidateOnboarding(schoolSlug, [`/${schoolSlug}/settings`, `/${schoolSlug}`]);
  return ok();
}