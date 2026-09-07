import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Order-agnostic "no rows" predicate used when the caller has genuine school
 * access but no visibility of any student (e.g. a teacher with no class
 * assignments).
 */
const NONE_WHERE = { id: { equals: "__none__" } };

/**
 * Translate a viewer's school access into a Prisma `StudentWhereInput` that
 * scopes the students they are allowed to see.
 *
 * - SCHOOL_ADMIN / platform staff (SUPER_ADMIN, SUPPORT): all students.
 * - TEACHER: students with an active-relevant enrollment in a class (and
 *   stream) they are assigned to teach.
 * - PARENT: students they are a linked guardian of.
 * - STUDENT: only their own linked student record.
 *
 * Every student query in this module MUST be combined with this scope so that
 * parents/students/teachers can never see each other's records.
 */
export async function studentsScopeWhere(
  access: SchoolAccess
): Promise<Prisma.StudentWhereInput> {
  const { user, membership, isPlatformStaff, schoolId } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") {
    return {};
  }

  if (membership?.role === "TEACHER") {
    const assignments = await db.teacherAssignment.findMany({
      where: { schoolId, teacherId: user.id },
      select: { classId: true, streamId: true },
    });
    if (assignments.length === 0) return NONE_WHERE;

    const wholeClassIds = new Set(
      assignments.filter((a) => a.streamId === null).map((a) => a.classId)
    );
    const streamsByClass = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.streamId) continue;
      const arr = streamsByClass.get(a.classId) ?? [];
      arr.push(a.streamId);
      streamsByClass.set(a.classId, arr);
    }

    const or: Prisma.EnrollmentWhereInput[] = [];
    for (const classId of wholeClassIds) {
      or.push({ classId });
    }
    for (const [classId, streamIds] of streamsByClass) {
      if (wholeClassIds.has(classId)) continue;
      or.push({ classId, streamId: { in: streamIds } });
    }
    if (or.length === 0) return NONE_WHERE;

    return { enrollments: { some: { OR: or } } };
  }

  if (membership?.role === "PARENT") {
    return { guardians: { some: { guardianUserId: user.id } } };
  }

  if (membership?.role === "STUDENT") {
    return { userId: user.id };
  }

  return NONE_WHERE;
}

/**
 * Whether the viewer may view a specific student in the tenant. Re-checks the
 * role scope so a parent/student/teacher cannot open arbitrary profiles.
 */
export async function canViewStudent(
  access: SchoolAccess,
  studentId: string
): Promise<boolean> {
  const scope = await studentsScopeWhere(access);
  const match = await db.student.findFirst({
    where: { id: studentId, schoolId: access.schoolId, ...scope },
    select: { id: true },
  });
  return match !== null;
}

/**
 * Validate that a class/stream/academic-year/term combination belongs to the
 * tenant and is internally consistent (stream within class; term within year).
 * Returns normalized ids (null-safe) or null when invalid.
 */
export async function resolveEnrollmentTarget(
  schoolId: string,
  classId: string,
  academicYearId: string,
  streamId?: string | null,
  termId?: string | null
): Promise<{
  classId: string;
  streamId: string | null;
  academicYearId: string;
  termId: string | null;
} | null> {
  const [cls, year] = await Promise.all([
    db.class.findUnique({
      where: { id: classId, schoolId },
      select: { id: true },
    }),
    db.academicYear.findUnique({
      where: { id: academicYearId, schoolId },
      select: { id: true },
    }),
  ]);
  if (!cls || !year) return null;

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

  const resolvedTermId = termId ?? null;
  if (resolvedTermId) {
    const term = await db.term.findUnique({
      where: { id: resolvedTermId },
      select: { academicYearId: true },
    });
    if (!term || term.academicYearId !== academicYearId) return null;
  }

  return {
    classId,
    streamId: resolvedStreamId,
    academicYearId,
    termId: resolvedTermId,
  };
}

/** Load a student only when it belongs to the tenant (or null). */
export async function getStudentInSchool(schoolId: string, studentId: string) {
  return db.student.findUnique({
    where: { id: studentId, schoolId },
  });
}