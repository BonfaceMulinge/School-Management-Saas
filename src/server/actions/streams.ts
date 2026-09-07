"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function streamSchema() {
  return z.object({
    classId: z.string().min(1, "Class is required."),
    name: z.string().trim().min(1, "Name is required.").max(120),
  });
}

async function assertClassInSchool(schoolId: string, classId: string) {
  return db.class.findUnique({
    where: { id: classId, schoolId },
    select: { id: true },
  });
}

export async function createStream(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "streams:manage");

  const parsed = streamSchema().safeParse({
    classId: input.get("classId"),
    name: input.get("name"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const cls = await assertClassInSchool(access.schoolId, data.classId);
  if (!cls) return fail("That class does not exist in this school.");

  const existing = await db.stream.findUnique({
    where: { classId_name: { classId: data.classId, name: data.name } },
    select: { id: true },
  });
  if (existing) {
    return fail("A stream with this name already exists in that class.", {
      name: ["Name must be unique within the class."],
    });
  }

  const created = await db.stream.create({
    data: { classId: data.classId, name: data.name },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/streams`);
  revalidatePath(`/${schoolSlug}/classes`);
  return ok({ id: created.id });
}

export async function updateStream(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "streams:manage");

  const existing = await db.stream.findUnique({
    where: { id },
    select: { id: true, class: { select: { schoolId: true } } },
  });
  if (!existing || existing.class.schoolId !== access.schoolId) {
    return fail("Stream not found.");
  }

  const parsed = streamSchema().safeParse({
    classId: input.get("classId"),
    name: input.get("name"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const cls = await assertClassInSchool(access.schoolId, data.classId);
  if (!cls) return fail("That class does not exist in this school.");

  const conflict = await db.stream.findUnique({
    where: { classId_name: { classId: data.classId, name: data.name } },
    select: { id: true },
  });
  if (conflict && conflict.id !== id) {
    return fail("A stream with this name already exists in that class.", {
      name: ["Name must be unique within the class."],
    });
  }

  await db.stream.update({
    where: { id },
    data: { classId: data.classId, name: data.name },
  });
  revalidatePath(`/${schoolSlug}/streams`);
  revalidatePath(`/${schoolSlug}/classes`);
  return ok();
}

export async function archiveStream(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "streams:manage");

  const existing = await db.stream.findUnique({
    where: { id },
    select: { id: true, class: { select: { schoolId: true } } },
  });
  if (!existing || existing.class.schoolId !== access.schoolId) {
    return fail("Stream not found.");
  }

  await db.stream.update({ where: { id }, data: { archived: true } });
  revalidatePath(`/${schoolSlug}/streams`);
  revalidatePath(`/${schoolSlug}/classes`);
  return ok();
}