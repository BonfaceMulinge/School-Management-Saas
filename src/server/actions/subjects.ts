"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function subjectSchema() {
  return z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Code is required.")
      .max(20)
      .regex(/^[A-Z0-9_\-]+$/, "Code may only contain letters, numbers, dashes and underscores."),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    department: z.string().trim().max(120).optional().or(z.literal("")),
  });
}

async function resolveSubject(schoolId: string, id: string) {
  return db.subject.findUnique({ where: { id, schoolId } });
}

export async function createSubject(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "subjects:manage");

  const parsed = subjectSchema().safeParse({
    name: input.get("name"),
    code: input.get("code"),
    description: input.get("description"),
    department: input.get("department"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const existing = await db.subject.findUnique({
    where: { schoolId_code: { schoolId: access.schoolId, code: data.code } },
    select: { id: true },
  });
  if (existing) {
    return fail("A subject with this code already exists.", {
      code: ["Code must be unique within the school."],
    });
  }

  const created = await db.subject.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      code: data.code,
      description: data.description || null,
      department: data.department || null,
    },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/subjects`);
  return ok({ id: created.id });
}

export async function updateSubject(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "subjects:manage");

  const existing = await resolveSubject(access.schoolId, id);
  if (!existing) return fail("Subject not found.");

  const parsed = subjectSchema().safeParse({
    name: input.get("name"),
    code: input.get("code"),
    description: input.get("description"),
    department: input.get("department"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const conflict = await db.subject.findUnique({
    where: { schoolId_code: { schoolId: access.schoolId, code: data.code } },
    select: { id: true },
  });
  if (conflict && conflict.id !== id) {
    return fail("A subject with this code already exists.", {
      code: ["Code must be unique within the school."],
    });
  }

  await db.subject.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code,
      description: data.description || null,
      department: data.department || null,
    },
  });
  revalidatePath(`/${schoolSlug}/subjects`);
  return ok();
}

export async function archiveSubject(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "subjects:manage");

  const existing = await resolveSubject(access.schoolId, id);
  if (!existing) return fail("Subject not found.");

  await db.subject.update({ where: { id }, data: { archived: true } });
  revalidatePath(`/${schoolSlug}/subjects`);
  return ok();
}