"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function classSchema() {
  return z.object({
    name: z.string().trim().min(1, "Name is required.").max(120),
  });
}

async function resolveClass(schoolId: string, id: string) {
  return db.class.findUnique({ where: { id, schoolId } });
}

export async function createClass(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "classes:manage");

  const parsed = classSchema().safeParse({ name: input.get("name") });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const name = parsed.data.name;

  const existing = await db.class.findUnique({
    where: { schoolId_name: { schoolId: access.schoolId, name } },
    select: { id: true },
  });
  if (existing) {
    return fail("A class with this name already exists.", {
      name: ["Name must be unique within the school."],
    });
  }

  const created = await db.class.create({
    data: { schoolId: access.schoolId, name },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/classes`);
  return ok({ id: created.id });
}

export async function updateClass(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "classes:manage");

  const existing = await resolveClass(access.schoolId, id);
  if (!existing) return fail("Class not found.");

  const parsed = classSchema().safeParse({ name: input.get("name") });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const name = parsed.data.name;

  const conflict = await db.class.findUnique({
    where: { schoolId_name: { schoolId: access.schoolId, name } },
    select: { id: true },
  });
  if (conflict && conflict.id !== id) {
    return fail("A class with this name already exists.", {
      name: ["Name must be unique within the school."],
    });
  }

  await db.class.update({ where: { id }, data: { name } });
  revalidatePath(`/${schoolSlug}/classes`);
  return ok();
}

export async function archiveClass(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "classes:manage");

  const existing = await resolveClass(access.schoolId, id);
  if (!existing) return fail("Class not found.");

  await db.$transaction([
    db.class.update({ where: { id }, data: { archived: true } }),
    db.stream.updateMany({ where: { classId: id }, data: { archived: true } }),
  ]);
  revalidatePath(`/${schoolSlug}/classes`);
  revalidatePath(`/${schoolSlug}/streams`);
  return ok();
}