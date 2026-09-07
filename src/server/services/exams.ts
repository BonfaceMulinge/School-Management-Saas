import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma } from "@/generated/prisma/client";

const NONE_WHERE = { id: { equals: "__none__" } };

type TeachingPair = { classId: string; streamId: string | null; subjectId: string };

/** Assignment pairs when the viewer is a TEACHER; empty otherwise. */
export async function teacherAssignmentPairs(
  access: SchoolAccess
): Promise<TeachingPair[]> {
  if (access.membership?.role !== "TEACHER") return [];
  const rows = await db.teacherAssignment.findMany({
    where: { schoolId: access.schoolId, teacherId: access.user.id },
    select: { classId: true, streamId: true, subjectId: true },
  });
  return rows.map((r) => ({
    classId: r.classId,
    streamId: r.streamId,
    subjectId: r.subjectId,
  }));
}

/**
 * Whether the user may manage an exam (create/edit/archive or enter marks)
 * for the given class/stream. Admins and platform staff: yes. Teachers: only
 * when they are assigned to teach that class (or the specific stream).
 */
export async function canManageExamFor(
  access: SchoolAccess,
  classId: string,
  streamId: string | null
): Promise<boolean> {
  if (access.isPlatformStaff || access.membership?.role === "SCHOOL_ADMIN") {
    return true;
  }
  if (access.membership?.role !== "TEACHER") return false;

  const pairs = await teacherAssignmentPairs(access);
  const wholeClass = new Set(
    pairs.filter((p) => p.streamId === null).map((p) => p.classId)
  );
  if (wholeClass.has(classId)) return true;
  return pairs.some(
    (p) => p.classId === classId && streamId !== null && p.streamId === streamId
  );
}

/**
 * Whether the viewer may record marks for a specific subject within a
 * class/stream. Teachers need an assignment for that exact subject (+ class/
 * stream); admins are always allowed.
 */
export async function canManageSubjectFor(
  access: SchoolAccess,
  subjectId: string,
  classId: string,
  streamId: string | null
): Promise<boolean> {
  if (access.isPlatformStaff || access.membership?.role === "SCHOOL_ADMIN") {
    return true;
  }
  if (access.membership?.role !== "TEACHER") return false;

  const pairs = await teacherAssignmentPairs(access);
  return pairs.some(
    (p) =>
      p.subjectId === subjectId &&
      p.classId === classId &&
      (p.streamId === null ? streamId === null : p.streamId === streamId)
  );
}

/**
 * Role-scoped Prisma `ExamWhereInput`. Admins/platform staff see all exams in
 * the tenant; teachers see exams for assigned classes/streams; students see
 * exams for the class they are enrolled in; parents for the classes their
 * children are enrolled in.
 */
export async function examScopeWhere(
  access: SchoolAccess
): Promise<Prisma.ExamWhereInput> {
  const { membership, isPlatformStaff, schoolId } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") return {};

  if (membership?.role === "TEACHER") {
    const pairs = await teacherAssignmentPairs(access);
    if (pairs.length === 0) return NONE_WHERE;

    const wholeClassIds = new Set(
      pairs.filter((p) => p.streamId === null).map((p) => p.classId)
    );
    const streamSet = pairs
      .filter((p) => p.streamId !== null)
      .map((p) => ({ classId: p.classId, streamId: p.streamId as string }));
    const streamOnlyClasses = new Set(
      streamSet.filter((p) => !wholeClassIds.has(p.classId)).map((p) => p.classId)
    );

    const or: Prisma.ExamWhereInput[] = [];
    for (const c of wholeClassIds) or.push({ classId: c });
    if (streamSet.length > 0) {
      or.push({
        AND: [
          { classId: { in: [...streamOnlyClasses] } },
          { streamId: { in: streamSet.map((p) => p.streamId) } },
        ],
      });
    }
    if (or.length === 0) return NONE_WHERE;
    return { OR: or };
  }

  // STUDENT / PARENT are scoped by the classes their student record(s) are
  // enrolled in this year.
  const studentIds = await scopeStudentIds(access);
  if (studentIds === null || studentIds.length === 0) return NONE_WHERE;

  const enrollments = await db.enrollment.findMany({
    where: {
      schoolId,
      studentId: { in: studentIds },
      status: "ACTIVE",
    },
    select: { classId: true },
    distinct: ["classId"],
  });
  if (enrollments.length === 0) return NONE_WHERE;
  return { classId: { in: enrollments.map((e) => e.classId) } };
}

/**
 * The student ids a viewer may see results for, or `null` for "all students".
 * - Admins/platform staff: all.
 * - Teachers: students enrolled in their assigned classes/streams.
 * - Parents: their linked children.
 * - Students: their own student record.
 */
export async function scopeStudentIds(
  access: SchoolAccess
): Promise<string[] | null> {
  const { user, membership, isPlatformStaff, schoolId } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") return null;

  if (membership?.role === "TEACHER") {
    const pairs = await teacherAssignmentPairs(access);
    if (pairs.length === 0) return [];

    const wholeClassIds = new Set(
      pairs.filter((p) => p.streamId === null).map((p) => p.classId)
    );
    const streamSet = pairs
      .filter((p) => p.streamId !== null)
      .map((p) => ({ classId: p.classId, streamId: p.streamId as string }));

    const or: Prisma.EnrollmentWhereInput[] = [];
    for (const c of wholeClassIds) or.push({ classId: c });
    if (streamSet.length > 0) {
      const streamOnlyClasses = new Set(
        streamSet.filter((p) => !wholeClassIds.has(p.classId)).map((p) => p.classId)
      );
      or.push({
        AND: [
          { classId: { in: [...streamOnlyClasses] } },
          { streamId: { in: streamSet.map((p) => p.streamId) } },
        ],
      });
    }

    const rows = await db.enrollment.findMany({
      where: { schoolId, status: "ACTIVE", OR: or },
      select: { studentId: true },
      distinct: ["studentId"],
    });
    return rows.map((r) => r.studentId);
  }

  if (membership?.role === "PARENT") {
    const rows = await db.guardian.findMany({
      where: { schoolId, guardianUserId: user.id },
      select: { studentId: true },
    });
    return rows.map((r) => r.studentId);
  }

  if (membership?.role === "STUDENT") {
    const me = await db.student.findFirst({
      where: { schoolId, userId: user.id },
      select: { id: true },
    });
    return me ? [me.id] : [];
  }

  return [];
}

/**
 * Enrolled (active, non-archived) students an exam applies to, based on the
 * exam's class/stream/year/term snapshot.
 */
export async function examRoster(exam: {
  classId: string;
  streamId: string | null;
  academicYearId: string;
  termId: string;
}) {
  return db.enrollment.findMany({
    where: {
      classId: exam.classId,
      academicYearId: exam.academicYearId,
      termId: exam.termId,
      status: "ACTIVE",
      ...(exam.streamId ? { streamId: exam.streamId } : {}),
      student: { archived: false },
    },
    select: {
      id: true,
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          studentNo: true,
          userId: true,
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });
}

/**
 * Detect a duplicate exam definition. The DB unique covers streamed exams;
 * this also catches stream-wide exams where `streamId` is NULL (Postgres
 * treats NULLs as distinct). `excludeId` skips the exam being edited.
 */
export async function findDuplicateExam(
  schoolId: string,
  args: {
    name: string;
    academicYearId: string;
    termId: string;
    classId: string;
    streamId: string | null;
  },
  excludeId?: string
): Promise<boolean> {
  const where: Prisma.ExamWhereInput = {
    schoolId,
    academicYearId: args.academicYearId,
    termId: args.termId,
    name: args.name,
    classId: args.classId,
    streamId: args.streamId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  const match = await db.exam.findFirst({ where, select: { id: true } });
  return match !== null;
}