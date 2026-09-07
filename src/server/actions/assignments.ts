"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";

function assignmentSchema() {
  return z.object({
    teacherId: z.string().min(1, "Teacher is required."),
    classId: z.string().min(1, "Class is required."),
    streamId: z.string().optional().nullable(),
    subjectId: z.string().min(1, "Subject is required."),
  });
}

async function assertTenantResources(
  schoolId: string,
  classId: string,
  streamId: string | null | undefined,
  subjectId: string
) {
  const cls = await db.class.findUnique({
    where: { id: classId, schoolId },
    select: { id: true },
  });
  if (!cls) return null;

  const resolvedStreamId = streamId ?? null;
  if (resolvedStreamId) {
    const stream = await db.stream.findUnique({
      where: { id: resolvedStreamId },
      select: { classId: true, class: { select: { schoolId: true } } },
    });
    if (!stream || stream.classId !== classId || stream.class.schoolId !== schoolId) {
      return null;
    }
  }

  const subject = await db.subject.findUnique({
    where: { id: subjectId, schoolId },
    select: { id: true },
  });
  if (!subject) return null;

  return { classId, streamId: resolvedStreamId, subjectId };
}

async function assertTeacherInSchool(schoolId: string, teacherId: string) {
  const membership = await db.membership.findUnique({
    where: { schoolId_userId: { schoolId, userId: teacherId } },
    select: { role: true },
  });
  if (!membership || membership.role !== "TEACHER") return false;
  return true;
}

async function existsDuplicate(
  schoolId: string,
  teacherId: string,
  classId: string,
  streamId: string | null | undefined,
  subjectId: string,
  excludeId?: string
) {
  const rows = await db.teacherAssignment.findMany({
    where: { schoolId, teacherId, classId, subjectId },
    select: { id: true, streamId: true },
  });
  return rows.some(
    (r) => r.id !== excludeId && (r.streamId === streamId || (!r.streamId && !streamId))
  );
}

export async function createAssignment(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "assignments:manage");

  const parsed = assignmentSchema().safeParse({
    teacherId: input.get("teacherId"),
    classId: input.get("classId"),
    streamId: input.get("streamId") || null,
    subjectId: input.get("subjectId"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  if (!(await assertTeacherInSchool(access.schoolId, data.teacherId))) {
    return fail("That user is not a teacher at this school.");
  }

  const resources = await assertTenantResources(
    access.schoolId,
    data.classId,
    data.streamId,
    data.subjectId
  );
  if (!resources) return fail("The selected class, stream or subject is invalid.");

  if (await existsDuplicate(access.schoolId, data.teacherId, data.classId, data.streamId, data.subjectId)) {
    return fail("This assignment already exists.");
  }

  const created = await db.teacherAssignment.create({
    data: {
      schoolId: access.schoolId,
      teacherId: data.teacherId,
      classId: resources.classId,
      streamId: resources.streamId,
      subjectId: resources.subjectId,
    },
    select: { id: true },
  });

  revalidatePath(`/${schoolSlug}/assignments`);
  return ok({ id: created.id });
}

export async function updateAssignment(
  schoolSlug: string,
  id: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "assignments:manage");

  const existing = await db.teacherAssignment.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true },
  });
  if (!existing) return fail("Assignment not found.");

  const parsed = assignmentSchema().safeParse({
    teacherId: input.get("teacherId"),
    classId: input.get("classId"),
    streamId: input.get("streamId") || null,
    subjectId: input.get("subjectId"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  if (!(await assertTeacherInSchool(access.schoolId, data.teacherId))) {
    return fail("That user is not a teacher at this school.");
  }

  const resources = await assertTenantResources(
    access.schoolId,
    data.classId,
    data.streamId,
    data.subjectId
  );
  if (!resources) return fail("The selected class, stream or subject is invalid.");

  if (await existsDuplicate(access.schoolId, data.teacherId, data.classId, data.streamId, data.subjectId, id)) {
    return fail("This assignment already exists.");
  }

  await db.teacherAssignment.update({
    where: { id },
    data: {
      teacherId: data.teacherId,
      classId: resources.classId,
      streamId: resources.streamId,
      subjectId: resources.subjectId,
    },
  });

  revalidatePath(`/${schoolSlug}/assignments`);
  return ok();
}

export async function deleteAssignment(schoolSlug: string, id: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "assignments:manage");

  const existing = await db.teacherAssignment.findUnique({
    where: { id, schoolId: access.schoolId },
    select: { id: true },
  });
  if (!existing) return fail("Assignment not found.");

  await db.teacherAssignment.delete({ where: { id } });
  revalidatePath(`/${schoolSlug}/assignments`);
  return ok();
}