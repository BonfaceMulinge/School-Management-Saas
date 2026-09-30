"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function pathwaySchema() {
  return z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    code: z
      .string()
      .trim()
      .min(1, "Code is required.")
      .max(20)
      .transform((v) => v.toUpperCase()),
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : null)),
  });
}

function revalidate(slug: string) {
  revalidatePath(`/${slug}/pathways`);
  revalidatePath(`/${slug}/combinations`);
}

export async function createPathway(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "pathways:manage");

  const parsed = pathwaySchema().safeParse({
    name: input.get("name"),
    code: input.get("code"),
    description: input.get("description") ?? "",
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const clash = await db.seniorSchoolPathway.findFirst({
    where: {
      schoolId: access.schoolId,
      OR: [{ name: data.name }, { code: data.code }],
    },
    select: { id: true },
  });
  if (clash) {
    return fail("A pathway with this name or code already exists.", {
      name: ["Name and code must be unique within the school."],
    });
  }

  const created = await db.seniorSchoolPathway.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      code: data.code,
      description: data.description,
    },
    select: { id: true },
  });

  revalidate(schoolSlug);
  return ok({ id: created.id });
}

export async function updatePathway(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "pathways:manage");

  const existing = await db.seniorSchoolPathway.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true },
  });
  if (!existing) return fail("Pathway not found.");

  const parsed = pathwaySchema().safeParse({
    name: input.get("name"),
    code: input.get("code"),
    description: input.get("description") ?? "",
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const clash = await db.seniorSchoolPathway.findFirst({
    where: {
      schoolId: access.schoolId,
      NOT: { id },
      OR: [{ name: data.name }, { code: data.code }],
    },
    select: { id: true },
  });
  if (clash) {
    return fail("A pathway with this name or code already exists.", {
      name: ["Name and code must be unique within the school."],
    });
  }

  await db.seniorSchoolPathway.update({
    where: { id },
    data: { name: data.name, code: data.code, description: data.description },
  });

  revalidate(schoolSlug);
  return ok();
}

export async function archivePathway(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "pathways:manage");

  const existing = await db.seniorSchoolPathway.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true, _count: { select: { enrollments: true } } },
  });
  if (!existing) return fail("Pathway not found.");

  if (existing._count.enrollments > 0) {
    return fail(
      "This pathway is still assigned to students. Remove it from those enrollments before archiving."
    );
  }

  await db.seniorSchoolPathway.update({ where: { id }, data: { archived: true } });

  revalidate(schoolSlug);
  return ok();
}

function combinationSchema() {
  return z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    code: z
      .string()
      .trim()
      .min(1, "Code is required.")
      .max(20)
      .transform((v) => v.toUpperCase()),
    description: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : null)),
    pathwayId: z.string().optional().nullable(),
    subjectIds: z.array(z.string()),
  });
}

function parseCombination(input: FormData) {
  const parsed = combinationSchema().safeParse({
    name: input.get("name"),
    code: input.get("code"),
    description: input.get("description") ?? "",
    pathwayId: input.get("pathwayId") || null,
    subjectIds: input.getAll("subjectIds").map(String).filter(Boolean),
  });
  return parsed.success
    ? { data: parsed.data, fieldErrors: undefined }
    : { data: null, fieldErrors: parsed.error.flatten().fieldErrors };
}

async function validateSubjects(schoolId: string, subjectIds: string[]) {
  const unique = [...new Set(subjectIds)];
  if (unique.length === 0) return null;
  const count = await db.subject.count({
    where: { schoolId, id: { in: unique }, archived: false },
  });
  return count === unique.length ? unique : null;
}

export async function createCombination(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "combinations:manage");

  const { data, fieldErrors } = parseCombination(input);
  if (!data) {
    return fail("Check the highlighted fields.", fieldErrors);
  }

  const clash = await db.subjectCombination.findFirst({
    where: {
      schoolId: access.schoolId,
      OR: [{ name: data.name }, { code: data.code }],
    },
    select: { id: true },
  });
  if (clash) {
    return fail("A combination with this name or code already exists.", {
      name: ["Name and code must be unique within the school."],
    });
  }

  let pathwayId: string | null = null;
  if (data.pathwayId) {
    const pathway = await db.seniorSchoolPathway.findUnique({
      where: { id: data.pathwayId, schoolId: access.schoolId },
      select: { id: true },
    });
    if (!pathway) return fail("That pathway does not exist in this school.");
    pathwayId = pathway.id;
  }

  const subjectIds = await validateSubjects(access.schoolId, data.subjectIds);
  if (!subjectIds) {
    return fail("One of the selected subjects is not available in this school.");
  }

  const created = await db.subjectCombination.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      code: data.code,
      description: data.description,
      seniorSchoolPathwayId: pathwayId,
      subjects: {
        create: subjectIds.map((subjectId, index) => ({ subjectId, sortOrder: index + 1 })),
      },
    },
    select: { id: true },
  });

  revalidate(schoolSlug);
  return ok({ id: created.id });
}

export async function updateCombination(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "combinations:manage");

  const existing = await db.subjectCombination.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true },
  });
  if (!existing) return fail("Combination not found.");

  const { data, fieldErrors } = parseCombination(input);
  if (!data) {
    return fail("Check the highlighted fields.", fieldErrors);
  }

  const clash = await db.subjectCombination.findFirst({
    where: {
      schoolId: access.schoolId,
      NOT: { id },
      OR: [{ name: data.name }, { code: data.code }],
    },
    select: { id: true },
  });
  if (clash) {
    return fail("A combination with this name or code already exists.", {
      name: ["Name and code must be unique within the school."],
    });
  }

  let pathwayId: string | null = null;
  if (data.pathwayId) {
    const pathway = await db.seniorSchoolPathway.findUnique({
      where: { id: data.pathwayId, schoolId: access.schoolId },
      select: { id: true },
    });
    if (!pathway) return fail("That pathway does not exist in this school.");
    pathwayId = pathway.id;
  }

  const subjectIds = await validateSubjects(access.schoolId, data.subjectIds);
  if (!subjectIds) {
    return fail("One of the selected subjects is not available in this school.");
  }

  await db.$transaction(async (tx) => {
    await tx.subjectCombination.update({
      where: { id },
      data: { name: data.name, code: data.code, description: data.description, seniorSchoolPathwayId: pathwayId },
    });
    await tx.subjectCombinationSubject.deleteMany({ where: { combinationId: id } });
    if (subjectIds.length > 0) {
      await tx.subjectCombinationSubject.createMany({
        data: subjectIds.map((subjectId, index) => ({
          combinationId: id,
          subjectId,
          sortOrder: index + 1,
        })),
      });
    }
  });

  revalidate(schoolSlug);
  return ok();
}

export async function archiveCombination(
  schoolSlug: string,
  id: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "combinations:manage");

  const existing = await db.subjectCombination.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true, _count: { select: { enrollments: true } } },
  });
  if (!existing) return fail("Combination not found.");

  if (existing._count.enrollments > 0) {
    return fail(
      "This combination is still assigned to students. Remove it from those enrollments before archiving."
    );
  }

  await db.subjectCombination.update({ where: { id }, data: { archived: true } });

  revalidate(schoolSlug);
  return ok();
}