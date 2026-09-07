"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function yearSchema() {
  return z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    startDate: z.coerce.date({ error: "Start date is required." }),
    endDate: z.coerce.date({ error: "End date is required." }),
  });
}

async function resolveYear(schoolId: string, id: string) {
  return db.academicYear.findUnique({
    where: { id, schoolId },
  });
}

export async function createAcademicYear(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "academic-years:manage");

  const parsed = yearSchema().safeParse({
    name: input.get("name"),
    startDate: input.get("startDate"),
    endDate: input.get("endDate"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;
  if (data.endDate <= data.startDate) {
    return fail("End date must be after the start date.", {
      endDate: ["End date must be after the start date."],
    });
  }

  const existing = await db.academicYear.findUnique({
    where: { schoolId_name: { schoolId: access.schoolId, name: data.name } },
    select: { id: true },
  });
  if (existing) {
    return fail("An academic year with this name already exists.", {
      name: ["Name must be unique within the school."],
    });
  }

  const created = await db.academicYear.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok({ id: created.id });
}

export async function updateAcademicYear(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "academic-years:manage");

  const existing = await resolveYear(access.schoolId, id);
  if (!existing) return fail("Academic year not found.");

  const parsed = yearSchema().safeParse({
    name: input.get("name"),
    startDate: input.get("startDate"),
    endDate: input.get("endDate"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;
  if (data.endDate <= data.startDate) {
    return fail("End date must be after the start date.", {
      endDate: ["End date must be after the start date."],
    });
  }

  const conflict = await db.academicYear.findUnique({
    where: { schoolId_name: { schoolId: access.schoolId, name: data.name } },
    select: { id: true },
  });
  if (conflict && conflict.id !== id) {
    return fail("An academic year with this name already exists.", {
      name: ["Name must be unique within the school."],
    });
  }

  await db.academicYear.update({
    where: { id },
    data: {
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  });

  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}

export async function archiveAcademicYear(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "academic-years:manage");

  const existing = await resolveYear(access.schoolId, id);
  if (!existing) return fail("Academic year not found.");
  if (existing.isActive) {
    return fail("You cannot archive the active academic year. Set another year active first.");
  }

  await db.academicYear.update({
    where: { id },
    data: { archived: true },
  });

  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}

export async function setActiveAcademicYear(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "academic-years:manage");

  const existing = await resolveYear(access.schoolId, id);
  if (!existing) return fail("Academic year not found.");
  if (existing.archived) return fail("An archived academic year cannot be activated.");

  await db.$transaction([
    db.academicYear.updateMany({
      where: { schoolId: access.schoolId, isActive: true },
      data: { isActive: false },
    }),
    db.academicYear.update({ where: { id }, data: { isActive: true, archived: false } }),
  ]);

  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}