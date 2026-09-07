"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function termSchema() {
  return z.object({
    academicYearId: z.string().min(1, "Academic year is required."),
    name: z.string().trim().min(1, "Name is required.").max(120),
    startDate: z.coerce.date({ error: "Start date is required." }),
    endDate: z.coerce.date({ error: "End date is required." }),
  });
}

async function assertYearInSchool(access: { schoolId: string }, academicYearId: string) {
  return db.academicYear.findUnique({
    where: { id: academicYearId, schoolId: access.schoolId },
    select: { id: true },
  });
}

async function hasOverlap(
  academicYearId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string
) {
  const candidates = await db.term.findMany({
    where: { academicYearId },
    select: { id: true, startDate: true, endDate: true },
  });
  return candidates.some(
    (t) => t.id !== excludeId && startDate <= t.endDate && endDate >= t.startDate
  );
}

export async function createTerm(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "terms:manage");

  const parsed = termSchema().safeParse({
    academicYearId: input.get("academicYearId"),
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

  const year = await assertYearInSchool(access, data.academicYearId);
  if (!year) return fail("That academic year does not exist in this school.");

  const nameConflict = await db.term.findUnique({
    where: { academicYearId_name: { academicYearId: data.academicYearId, name: data.name } },
    select: { id: true },
  });
  if (nameConflict) {
    return fail("A term with this name already exists in that academic year.", {
      name: ["Name must be unique within the academic year."],
    });
  }

  if (await hasOverlap(data.academicYearId, data.startDate, data.endDate)) {
    return fail("This term overlaps an existing term in that academic year.", {
      startDate: ["Overlaps an existing term."],
      endDate: ["Overlaps an existing term."],
    });
  }

  const created = await db.term.create({
    data: {
      academicYearId: data.academicYearId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/terms`);
  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok({ id: created.id });
}

export async function updateTerm(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "terms:manage");

  const existing = await db.term.findUnique({
    where: { id },
    select: { id: true, academicYear: { select: { schoolId: true } } },
  });
  if (!existing || existing.academicYear.schoolId !== access.schoolId) {
    return fail("Term not found.");
  }

  const parsed = termSchema().safeParse({
    academicYearId: input.get("academicYearId"),
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

  const year = await assertYearInSchool(access, data.academicYearId);
  if (!year) return fail("That academic year does not exist in this school.");

  const nameConflict = await db.term.findUnique({
    where: { academicYearId_name: { academicYearId: data.academicYearId, name: data.name } },
    select: { id: true },
  });
  if (nameConflict && nameConflict.id !== id) {
    return fail("A term with this name already exists in that academic year.", {
      name: ["Name must be unique within the academic year."],
    });
  }

  if (await hasOverlap(data.academicYearId, data.startDate, data.endDate, id)) {
    return fail("This term overlaps an existing term in that academic year.", {
      startDate: ["Overlaps an existing term."],
      endDate: ["Overlaps an existing term."],
    });
  }

  await db.term.update({
    where: { id },
    data: {
      academicYearId: data.academicYearId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
    },
  });

  revalidatePath(`/${schoolSlug}/terms`);
  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}

export async function archiveTerm(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "terms:manage");

  const existing = await db.term.findUnique({
    where: { id },
    select: { id: true, isActive: true, academicYear: { select: { schoolId: true } } },
  });
  if (!existing || existing.academicYear.schoolId !== access.schoolId) {
    return fail("Term not found.");
  }
  if (existing.isActive) {
    return fail("You cannot archive the active term. Set another term active first.");
  }

  await db.term.update({ where: { id }, data: { archived: true } });
  revalidatePath(`/${schoolSlug}/terms`);
  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}

export async function setActiveTerm(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "terms:manage");

  const existing = await db.term.findUnique({
    where: { id },
    select: { id: true, archived: true, academicYear: { select: { schoolId: true } } },
  });
  if (!existing || existing.academicYear.schoolId !== access.schoolId) {
    return fail("Term not found.");
  }
  if (existing.archived) return fail("An archived term cannot be activated.");

  await db.$transaction([
    db.term.updateMany({
      where: { academicYear: { schoolId: access.schoolId }, isActive: true },
      data: { isActive: false },
    }),
    db.term.update({ where: { id }, data: { isActive: true, archived: false } }),
  ]);

  revalidatePath(`/${schoolSlug}/terms`);
  revalidatePath(`/${schoolSlug}/academic-years`);
  return ok();
}