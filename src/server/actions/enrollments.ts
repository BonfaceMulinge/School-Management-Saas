"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { getStudentInSchool, resolveEnrollmentTarget } from "@/server/services/students";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { EnrollmentStatus } from "@/generated/prisma/client";

const enrollmentStatusEnum = z.enum([
  "ACTIVE",
  "INACTIVE",
  "GRADUATED",
  "TRANSFERRED",
  "DROPPED",
]);

function enrollmentSchema(withStudent = true) {
  return z.object({
    studentId: withStudent ? z.string().min(1, "Student is required.") : z.string(),
    classId: z.string().min(1, "Class is required."),
    streamId: z.string().optional().nullable(),
    academicYearId: z.string().min(1, "Academic year is required."),
    termId: z.string().optional().nullable(),
    status: enrollmentStatusEnum.optional().default("ACTIVE"),
  });
}

/** Find the student's currently active enrollment in a given academic year. */
async function activeEnrollmentInYear(
  schoolId: string,
  studentId: string,
  academicYearId: string,
  excludeId?: string
) {
  return db.enrollment.findFirst({
    where: {
      schoolId,
      studentId,
      academicYearId,
      status: "ACTIVE",
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, classId: true, streamId: true, termId: true },
  });
}

function revalidate(slug: string, studentId: string) {
  revalidatePath(`/${slug}/students`);
  revalidatePath(`/${slug}/students/${studentId}`);
}

export async function enrollStudent(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "enrollments:manage");

  const parsed = enrollmentSchema().safeParse({
    studentId: input.get("studentId"),
    classId: input.get("classId"),
    streamId: input.get("streamId") || null,
    academicYearId: input.get("academicYearId"),
    termId: input.get("termId") || null,
    status: input.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const student = await getStudentInSchool(access.schoolId, data.studentId);
  if (!student) return fail("Student not found.");
  if (student.archived) return fail("An archived student cannot be enrolled.");

  const target = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!target) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  const existingActive = await activeEnrollmentInYear(
    access.schoolId,
    data.studentId,
    target.academicYearId
  );
  if (existingActive) {
    return fail(
      "This student is already actively enrolled for that academic year. Use Transfer to change their class or stream."
    );
  }

  const created = await db.enrollment.create({
    data: {
      schoolId: access.schoolId,
      studentId: data.studentId,
      classId: target.classId,
      streamId: target.streamId,
      academicYearId: target.academicYearId,
      termId: target.termId,
      status: (data.status as EnrollmentStatus | undefined) ?? "ACTIVE",
    },
    select: { id: true },
  });

  revalidate(schoolSlug, data.studentId);
  return ok({ id: created.id });
}

export async function transferStudent(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "enrollments:manage");

  const parsed = enrollmentSchema().safeParse({
    studentId: input.get("studentId"),
    classId: input.get("classId"),
    streamId: input.get("streamId") || null,
    academicYearId: input.get("academicYearId"),
    termId: input.get("termId") || null,
    status: input.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const student = await getStudentInSchool(access.schoolId, data.studentId);
  if (!student) return fail("Student not found.");
  if (student.archived) return fail("An archived student cannot be transferred.");

  const target = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!target) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  const existingActive = await activeEnrollmentInYear(
    access.schoolId,
    data.studentId,
    target.academicYearId
  );

  const created = await db.$transaction(async (tx) => {
    if (existingActive) {
      await tx.enrollment.update({
        where: { id: existingActive.id },
        data: { status: "TRANSFERRED" },
      });
    }
    return tx.enrollment.create({
      data: {
        schoolId: access.schoolId,
        studentId: data.studentId,
        classId: target.classId,
        streamId: target.streamId,
        academicYearId: target.academicYearId,
        termId: target.termId,
        status: (data.status as EnrollmentStatus | undefined) ?? "ACTIVE",
      },
      select: { id: true },
    });
  });

  revalidate(schoolSlug, data.studentId);
  return ok({ id: created.id });
}

export async function promoteStudent(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "enrollments:manage");

  const parsed = enrollmentSchema().safeParse({
    studentId: input.get("studentId"),
    classId: input.get("classId"),
    streamId: input.get("streamId") || null,
    academicYearId: input.get("academicYearId"),
    termId: input.get("termId") || null,
    status: input.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const student = await getStudentInSchool(access.schoolId, data.studentId);
  if (!student) return fail("Student not found.");
  if (student.archived) return fail("An archived student cannot be promoted.");

  const target = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!target) return fail("The selected class, stream, year or term is invalid.");

  const targetYear = await db.academicYear.findUnique({
    where: { id: target.academicYearId },
    select: { startDate: true },
  });
  if (!targetYear) return fail("Academic year not found.");

  const existingActive = await activeEnrollmentInYear(
    access.schoolId,
    data.studentId,
    target.academicYearId
  );
  if (existingActive) {
    return fail(
      "This student is already actively enrolled for that academic year. Use Transfer to move them within the same year."
    );
  }

  const created = await db.$transaction(async (tx) => {
    // Completion of prior years: mark enrollments whose year predates the new
    // year as graduated, preserving them as historical records.
    await tx.enrollment.updateMany({
      where: {
        schoolId: access.schoolId,
        studentId: data.studentId,
        status: "ACTIVE",
        academicYear: { startDate: { lt: targetYear.startDate } },
      },
      data: { status: "GRADUATED" },
    });

    return tx.enrollment.create({
      data: {
        schoolId: access.schoolId,
        studentId: data.studentId,
        classId: target.classId,
        streamId: target.streamId,
        academicYearId: target.academicYearId,
        termId: target.termId,
        status: (data.status as EnrollmentStatus | undefined) ?? "ACTIVE",
      },
      select: { id: true },
    });
  });

  revalidate(schoolSlug, data.studentId);
  return ok({ id: created.id });
}

export async function updateEnrollmentStatus(
  schoolSlug: string,
  enrollmentId: string,
  status: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "enrollments:manage");

  const parsed = enrollmentStatusEnum.safeParse(status);
  if (!parsed.success) return fail("Invalid enrollment status.");

  const existing = await db.enrollment.findUnique({
    where: { id: enrollmentId, schoolId: access.schoolId },
    select: { id: true, studentId: true },
  });
  if (!existing) return fail("Enrollment not found.");

  await db.enrollment.update({
    where: { id: enrollmentId },
    data: { status: parsed.data },
  });

  revalidate(schoolSlug, existing.studentId);
  return ok();
}