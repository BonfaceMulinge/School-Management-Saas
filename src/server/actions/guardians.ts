"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { getStudentInSchool } from "@/server/services/students";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const parentSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  name: z.string().trim().min(1, "Guardian name is required.").max(120),
});

const linkSchema = z.object({
  studentId: z.string().min(1, "Student is required."),
  guardianUserId: z.string().min(1, "Guardian is required."),
  relationship: z.string().trim().max(60).optional(),
  isPrimary: z.string().optional(),
});

function revalidate(slug: string, studentId: string) {
  revalidatePath(`/${slug}/students`);
  revalidatePath(`/${slug}/students/${studentId}`);
  revalidatePath(`/${slug}/parents`);
}

async function isParentInSchool(schoolId: string, userId: string) {
  const membership = await db.membership.findFirst({
    where: { schoolId, userId, role: "PARENT" },
    select: { id: true },
  });
  return membership !== null;
}

export async function createParentUser(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ userId: string }>> {
  const access = await assertPermission(schoolSlug, "parents:manage");

  const parsed = parentSchema.safeParse({
    email: input.get("email"),
    name: input.get("name"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  let user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  if (!user) {
    user = await db.user.create({
      data: { email: parsed.data.email, name: parsed.data.name },
      select: { id: true },
    });
  }

  await db.membership.upsert({
    where: {
      schoolId_userId: { userId: user.id, schoolId: access.schoolId },
    },
    update: { role: "PARENT" },
    create: { userId: user.id, schoolId: access.schoolId, role: "PARENT" },
  });

  revalidatePath(`/${schoolSlug}/parents`);
  return ok({ userId: user.id });
}

export async function linkGuardian(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "parents:manage");

  const parsed = linkSchema.safeParse({
    studentId: input.get("studentId"),
    guardianUserId: input.get("guardianUserId"),
    relationship: input.get("relationship"),
    isPrimary: input.get("isPrimary"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const [student, guardian = null] = await Promise.all([
    getStudentInSchool(access.schoolId, data.studentId),
    db.user.findUnique({
      where: { id: data.guardianUserId },
      select: { id: true },
    }),
  ]);
  if (!student) return fail("Student not found.");
  if (!guardian) return fail("Guardian account not found.");

  if (!(await isParentInSchool(access.schoolId, guardian.id))) {
    return fail("This user is not a parent at this school.");
  }

  const existing = await db.guardian.findUnique({
    where: {
      schoolId_studentId_guardianUserId: {
        schoolId: access.schoolId,
        studentId: data.studentId,
        guardianUserId: guardian.id,
      },
    },
    select: { id: true },
  });
  if (existing) return fail("This guardian is already linked to the student.");

  const wantPrimary = data.isPrimary === "on" || data.isPrimary === "true";
  const existingCount = await db.guardian.count({
    where: { schoolId: access.schoolId, studentId: data.studentId },
  });

  await db.$transaction(async (tx) => {
    if (wantPrimary) {
      await tx.guardian.updateMany({
        where: { schoolId: access.schoolId, studentId: data.studentId },
        data: { isPrimary: false },
      });
    }
    await tx.guardian.create({
      data: {
        schoolId: access.schoolId,
        studentId: data.studentId,
        guardianUserId: guardian.id,
        relationship: data.relationship?.trim() || "Parent",
        isPrimary: wantPrimary || existingCount === 0,
      },
    });
  });

  revalidate(schoolSlug, data.studentId);
  return ok();
}

export async function unlinkGuardian(
  schoolSlug: string,
  guardianId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "parents:manage");

  const existing = await db.guardian.findUnique({
    where: { id: guardianId, schoolId: access.schoolId },
    select: { id: true, studentId: true, isPrimary: true },
  });
  if (!existing) return fail("Guardian link not found.");

  await db.$transaction(async (tx) => {
    await tx.guardian.delete({ where: { id: guardianId } });

    if (existing.isPrimary) {
      const other = await tx.guardian.findFirst({
        where: { schoolId: access.schoolId, studentId: existing.studentId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (other) {
        await tx.guardian.update({
          where: { id: other.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  revalidate(schoolSlug, existing.studentId);
  return ok();
}

export async function setPrimaryGuardian(
  schoolSlug: string,
  studentId: string,
  guardianId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "parents:manage");

  const guardian = await db.guardian.findUnique({
    where: { id: guardianId, schoolId: access.schoolId },
    select: { id: true, studentId: true },
  });
  if (!guardian) return fail("Guardian link not found.");
  if (guardian.studentId !== studentId) return fail("Guardian does not belong to this student.");

  await db.$transaction([
    db.guardian.updateMany({
      where: { schoolId: access.schoolId, studentId },
      data: { isPrimary: false },
    }),
    db.guardian.update({
      where: { id: guardianId },
      data: { isPrimary: true },
    }),
  ]);

  revalidate(schoolSlug, studentId);
  return ok();
}