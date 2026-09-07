import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma } from "@/generated/prisma/client";

const NONE_WHERE = { id: { equals: "__none__" } };

/** Convert an "YYYY-MM-DD" form value into a UTC day range for @db.Date. */
export function dayRange(dateString: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const [y, m, d] = dateString.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return {
    start: new Date(Date.UTC(y, m - 1, d)),
    end: new Date(Date.UTC(y, m - 1, d + 1)),
  };
}

export function todayDateString(): string {
  const now = new Date();
  const tp = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${tp(now.getMonth() + 1)}-${tp(now.getDate())}`;
}

type AssignmentPair = { classId: string; streamId: string | null };

/**
 * The class/stream pairs the current user is assigned to teach. Empty for
 * non-teachers; admins are handled separately by callers.
 */
export async function teacherAssignmentPairs(
  access: SchoolAccess
): Promise<AssignmentPair[]> {
  if (access.membership?.role !== "TEACHER") return [];
  const rows = await db.teacherAssignment.findMany({
    where: { schoolId: access.schoolId, teacherId: access.user.id },
    select: { classId: true, streamId: true },
  });
  return rows.map((r) => ({ classId: r.classId, streamId: r.streamId }));
}

/**
 * Whether the user may mark/correct attendance for a class/stream:
 * - Admins and platform staff: yes.
 * - Teachers: only classes (or streams) they are assigned to teach.
 * Always tenant-scoped by the caller's school.
 */
export async function canManageAttendanceFor(
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
 * Role-scoped Prisma `AttendanceWhereInput` so parents see only their linked
 * children, students only their own record, and teachers only records inside
 * their assigned classes/streams. Admin/platform staff see everything in the
 * tenant.
 */
export async function attendanceScopeWhere(
  access: SchoolAccess
): Promise<Prisma.AttendanceWhereInput> {
  const { user, membership, isPlatformStaff } = access;

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

    const or: Prisma.AttendanceWhereInput[] = [];
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

  if (membership?.role === "PARENT") {
    return {
      student: {
        guardians: { some: { guardianUserId: user.id } },
      },
    };
  }

  if (membership?.role === "STUDENT") {
    return { student: { userId: user.id } };
  }

  return NONE_WHERE;
}

/**
 * Enrolled students for a class/stream in a given academic year (+ optional
 * term). Used as the register to mark attendance against.
 */
export async function attendanceRoster(
  schoolId: string,
  classId: string,
  academicYearId: string,
  streamId?: string | null,
  termId?: string | null
) {
  return db.enrollment.findMany({
    where: {
      schoolId,
      classId,
      academicYearId,
      status: "ACTIVE",
      ...(streamId ? { streamId } : {}),
      ...(termId ? { termId } : {}),
      student: { archived: false },
    },
    select: {
      id: true,
      classId: true,
      streamId: true,
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

/** Validate tenant-scoped class/stream/year/term combination (reuses resolver). */
export { resolveEnrollmentTarget } from "@/server/services/students";