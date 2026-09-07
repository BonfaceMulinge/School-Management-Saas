import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma } from "@/generated/prisma/client";
import { studentsScopeWhere } from "@/server/services/students";
import {
  financeStudentsScopeWhere,
  buildStudentLedger,
  roundMoney,
} from "@/server/services/finance";
import {
  attendanceScopeWhere,
  dayRange,
  teacherAssignmentPairs,
} from "@/server/services/attendance";
import {
  examScopeWhere,
  scopeStudentIds,
} from "@/server/services/exams";
import {
  bandsToView,
  computeStudentExam,
  addRanks,
  gradeFor,
} from "@/server/services/results";
import { visibleAnnouncementsWhere } from "@/server/services/communication";
import { fullName } from "@/lib/students";
import { paymentMethodLabel } from "@/lib/finance";

/**
 * Report Center query layer (Phase 9). Every report reuses the module-level
 * scope helpers so parents see only linked children, students only their own
 * records, teachers only assigned classes and admins the whole tenant.
 * Return values are plain, serializable objects (no Decimal fields).
 */

export type DateFilter = { from?: string; to?: string };

function dayBounds(f: DateFilter): { gte?: Date; lt?: Date } {
  const from = f.from ? dayRange(f.from) : null;
  const to = f.to ? dayRange(f.to) : null;
  return {
    ...(from ? { gte: from.start } : {}),
    ...(to ? { lt: to.end } : {}),
  };
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

/** Paginated student roster with filters (name/admission search, gender,
 * status, current class/stream). */
export async function studentListReport(
  access: SchoolAccess,
  filters: {
    q?: string;
    gender?: string;
    status?: string;
    classId?: string;
    streamId?: string;
    page?: number;
    take?: number;
  }
) {
  const scope = await studentsScopeWhere(access);
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(200, Math.max(1, filters.take ?? 100));

  const qWhere: Prisma.StudentWhereInput = filters.q
    ? {
        OR: [
          { firstName: { contains: filters.q, mode: "insensitive" as const } },
          { middleName: { contains: filters.q, mode: "insensitive" as const } },
          { lastName: { contains: filters.q, mode: "insensitive" as const } },
          { studentNo: { contains: filters.q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const placementWhere: Prisma.EnrollmentWhereInput = {
    status: "ACTIVE",
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
  };

  const where: Prisma.StudentWhereInput = {
    schoolId: access.schoolId,
    archived: false,
    ...scope,
    ...(filters.gender ? { gender: filters.gender as "MALE" | "FEMALE" | "OTHER" } : {}),
    ...(filters.status ? { status: filters.status as "ACTIVE" | "SUSPENDED" | "WITHDRAWN" } : {}),
    ...qWhere,
    ...(filters.classId || filters.streamId
      ? { enrollments: { some: placementWhere } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        studentNo: true,
        gender: true,
        status: true,
        dateOfBirth: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: {
            class: { select: { name: true } },
            stream: { select: { name: true } },
          },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * take,
      take,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((s) => ({
      id: s.id,
      name: fullName(s.firstName, s.middleName, s.lastName),
      studentNo: s.studentNo,
      gender: s.gender,
      status: s.status,
      dateOfBirth: s.dateOfBirth,
      className: s.enrollments[0]?.class?.name ?? "—",
      streamName: s.enrollments[0]?.stream?.name ?? "—",
    })),
  };
}

/** Enrollment movement report: student-level rows with class/stream placement
 * per academic year/term. */
export async function enrollmentReport(
  access: SchoolAccess,
  filters: {
    yearId?: string;
    termId?: string;
    classId?: string;
    streamId?: string;
    status?: string;
    page?: number;
    take?: number;
  }
) {
  const scope = await studentsScopeWhere(access);
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(200, Math.max(1, filters.take ?? 100));

  const where: Prisma.EnrollmentWhereInput = {
    schoolId: access.schoolId,
    ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
    ...(filters.status ? { status: filters.status as "ACTIVE" | "INACTIVE" | "GRADUATED" | "TRANSFERRED" | "DROPPED" } : {}),
    student: { archived: false, ...scope },
  };

  const [total, rows] = await Promise.all([
    db.enrollment.count({ where }),
    db.enrollment.findMany({
      where,
      include: {
        academicYear: { select: { name: true } },
        term: { select: { name: true } },
        class: { select: { name: true } },
        stream: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            studentNo: true,
            status: true,
          },
        },
      },
      orderBy: [{ student: { lastName: "asc" } }, { enrolledAt: "desc" }],
      skip: (page - 1) * take,
      take,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((e) => ({
      id: e.id,
      studentId: e.student.id,
      studentName: fullName(e.student.firstName, e.student.middleName, e.student.lastName),
      studentNo: e.student.studentNo,
      studentStatus: e.student.status,
      yearName: e.academicYear?.name ?? "—",
      termName: e.term?.name ?? "—",
      className: e.class?.name ?? "—",
      streamName: e.stream?.name ?? "—",
      enrollmentStatus: e.status,
      enrolledAt: e.enrolledAt,
    })),
  };
}

/** Headcount per class/stream for a year (or all years). */
export async function classStreamDistribution(
  access: SchoolAccess,
  filters: { yearId?: string }
) {
  const scope = await studentsScopeWhere(access);
  const groups = await db.enrollment.groupBy({
    by: ["classId", "streamId"],
    where: {
      schoolId: access.schoolId,
      ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
      status: "ACTIVE",
      student: { archived: false, ...scope },
    },
    _count: { _all: true },
  });

  const classes = await db.class.findMany({
    where: { schoolId: access.schoolId, archived: false },
    include: { streams: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const classKm = new Map(classes.map((c) => [c.id, c]));

  const rows = groups.map((g) => {
    const klass = classKm.get(g.classId);
    const stream = g.streamId
      ? klass?.streams.find((s) => s.id === g.streamId)?.name ?? "—"
      : "Whole class";
    return {
      className: klass?.name ?? "—",
      streamName: stream,
      students: g._count._all,
    };
  });
  rows.sort((a, b) => a.className.localeCompare(b.className));
  return {
    rows,
    total: rows.reduce((a, r) => a + r.students, 0),
  };
}

/** Student gender distribution (active, non-archived). */
export async function genderDistribution(access: SchoolAccess) {
  const scope = await studentsScopeWhere(access);
  const groups = await db.student.groupBy({
    by: ["gender"],
    where: { schoolId: access.schoolId, archived: false, ...scope },
    _count: { _all: true },
  });
  const rows = groups.map((g) => ({ gender: g.gender, count: g._count._all }));
  return {
    rows,
    total: rows.reduce((a, r) => a + r.count, 0),
  };
}

/** Student academic-status distribution. */
export async function studentStatusDistribution(access: SchoolAccess) {
  const scope = await studentsScopeWhere(access);
  const groups = await db.student.groupBy({
    by: ["status"],
    where: { schoolId: access.schoolId, archived: false, ...scope },
    _count: { _all: true },
  });
  const rows = groups.map((g) => ({ status: g.status, count: g._count._all }));
  return {
    rows,
    total: rows.reduce((a, r) => a + r.count, 0),
  };
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** Per-student attendance rows for one day, with status totals. */
export async function dailyAttendanceReport(
  access: SchoolAccess,
  filters: { date?: string; classId?: string; streamId?: string }
) {
  const scope = await attendanceScopeWhere(access);
  const range = filters.date ? dayRange(filters.date) : dayRange(dayRangeToday());
  if (!range) return { rows: [], counts: {}, date: filters.date ?? "" };

  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.schoolId,
    date: { gte: range.start, lt: range.end },
    ...scope,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
  };

  const rows = await db.attendance.findMany({
    where,
    include: {
      class: { select: { name: true } },
      stream: { select: { name: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          studentNo: true,
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return {
    date: filters.date ?? dayRangeToday(),
    rows: rows.map((r) => ({
      id: r.id,
      studentId: r.student.id,
      studentName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
      studentNo: r.student.studentNo,
      className: r.class?.name ?? "—",
      streamName: r.stream?.name ?? "—",
      status: r.status,
    })),
    counts,
  };
}

function dayRangeToday(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Attendance summary (by status) over a date range. */
export async function attendanceSummary(
  access: SchoolAccess,
  filters: DateFilter & { classId?: string; streamId?: string }
) {
  const scope = await attendanceScopeWhere(access);
  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.schoolId,
    ...dayBounds(filters),
    ...scope,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
  };
  const groups = await db.attendance.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.status] = g._count._all;
  const total = groups.reduce((a, g) => a + g._count._all, 0);
  const present = counts.PRESENT ?? 0;
  return { counts, total, percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : null };
}

/** Attendance history for one student over a range (status totals + %). */
export async function studentAttendanceHistory(
  access: SchoolAccess,
  studentId: string,
  filters: DateFilter
) {
  const scope = await attendanceScopeWhere(access);
  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.schoolId,
    studentId,
    ...dayBounds(filters),
    ...scope,
  };
  const groups = await db.attendance.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of groups) counts[g.status] = g._count._all;
  const total = groups.reduce((a, g) => a + g._count._all, 0);
  const present = (counts.PRESENT ?? 0) + (counts.LATE ?? 0);
  return {
    counts,
    total,
    percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
  };
}

/** Per-student attendance totals for one class/stream over a range. */
export async function classStreamAttendanceReport(
  access: SchoolAccess,
  filters: { classId?: string; streamId?: string } & DateFilter
) {
  const scope = await attendanceScopeWhere(access);
  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.schoolId,
    ...dayBounds(filters),
    ...scope,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
  };

  const rows = await db.attendance.findMany({
    where,
    include: {
      class: { select: { name: true } },
      stream: { select: { name: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          studentNo: true,
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });

  const byStudent = new Map<
    string,
    {
      studentId: string;
      studentName: string;
      studentNo: string | null;
      className: string;
      streamName: string;
      counts: Record<string, number>;
    }
  >();
  for (const r of rows) {
    const key = r.student.id;
    const entry = byStudent.get(key) ?? {
      studentId: r.student.id,
      studentName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
      studentNo: r.student.studentNo,
      className: r.class?.name ?? "—",
      streamName: r.stream?.name ?? "—",
      counts: {},
    };
    entry.counts[r.status] = (entry.counts[r.status] ?? 0) + 1;
    byStudent.set(key, entry);
  }

  const list = [...byStudent.values()].map((e) => {
    const total = Object.values(e.counts).reduce((a, b) => a + b, 0);
    const present = (e.counts.PRESENT ?? 0) + (e.counts.LATE ?? 0);
    return {
      ...e,
      total,
      percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
    };
  });
  list.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return { rows: list };
}

/** Absences & late arrivals listing (paginated). */
export async function absenceLateReport(
  access: SchoolAccess,
  filters: DateFilter & { classId?: string; streamId?: string; page?: number; take?: number }
) {
  const scope = await attendanceScopeWhere(access);
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(200, Math.max(1, filters.take ?? 100));

  const where: Prisma.AttendanceWhereInput = {
    schoolId: access.schoolId,
    status: { in: ["ABSENT", "LATE"] },
    ...dayBounds(filters),
    ...scope,
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.streamId ? { streamId: filters.streamId } : {}),
  };

  const [total, rows] = await Promise.all([
    db.attendance.count({ where }),
    db.attendance.findMany({
      where,
      include: {
        class: { select: { name: true } },
        stream: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            studentNo: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { student: { lastName: "asc" } }],
      skip: (page - 1) * take,
      take,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((r) => ({
      id: r.id,
      studentId: r.student.id,
      studentName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
      studentNo: r.student.studentNo,
      className: r.class?.name ?? "—",
      streamName: r.stream?.name ?? "—",
      date: r.date,
      status: r.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Academic
// ---------------------------------------------------------------------------

/** Full result matrix for one exam: every roster student with per-subject
 * marks, overall %, grade and rank. */
export async function examResultsReport(
  access: SchoolAccess,
  filters: { examId?: string; yearId?: string; termId?: string; classId?: string }
) {
  const examScope = await examScopeWhere(access);
  const examWhere: Prisma.ExamWhereInput = {
    schoolId: access.schoolId,
    status: { not: "ARCHIVED" },
    ...examScope,
    ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
  };

  const exams = await db.exam.findMany({
    where: examWhere,
    include: {
      academicYear: { select: { name: true } },
      term: { select: { name: true } },
      class: { select: { name: true } },
      stream: { select: { name: true } },
      subjects: { include: { subject: { select: { id: true, name: true } } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  if (exams.length === 0) return { exams: [], exam: null, rows: [], bands: [] };

  const defaultScale = await db.gradeScale.findFirst({
    where: { schoolId: access.schoolId, isDefault: true },
    include: { bands: true },
  });
  const bands = bandsToView(defaultScale?.bands ?? []);

  const exam =
    exams.find((e) => e.id === filters.examId) ?? exams[0];
  const prepared = await prepareExamReport(access, exam, bands);
  return { exams, exam: prepared.meta, rows: prepared.rows, bands };
}

async function prepareExamReport(
  access: SchoolAccess,
  exam: {
    id: string;
    classId: string;
    streamId: string | null;
    academicYearId: string;
    termId: string;
    name: string;
    date: Date;
    academicYear: { name: string };
    term: { name: string } | null;
    class: { name: string };
    stream: { name: string } | null;
    subjects: Array<{
      subjectId: string;
      maxMarks: Prisma.Decimal;
      subject: { name: string };
    }>;
  },
  bands: ReturnType<typeof bandsToView>
) {
  const papers = exam.subjects.map((s) => ({
    subjectId: s.subjectId,
    subjectName: s.subject.name,
    maxMarks: s.maxMarks.toNumber(),
  }));

  const marks = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId: exam.id },
    select: { studentId: true, subjectId: true, marksObtained: true },
  });
  const marksByStudent = new Map<string, Map<string, number>>();
  for (const m of marks) {
    const inner = marksByStudent.get(m.studentId) ?? new Map<string, number>();
    inner.set(m.subjectId, m.marksObtained.toNumber());
    marksByStudent.set(m.studentId, inner);
  }

  const roster = await db.enrollment.findMany({
    where: {
      schoolId: access.schoolId,
      classId: exam.classId,
      academicYearId: exam.academicYearId,
      termId: exam.termId,
      status: "ACTIVE",
      ...(exam.streamId ? { streamId: exam.streamId } : {}),
      student: { archived: false },
    },
    select: {
      student: {
        select: {
          id: true,
          firstName: true,
          middleName: true,
          lastName: true,
          studentNo: true,
        },
      },
    },
    orderBy: { student: { lastName: "asc" } },
  });

  const rows = roster.map((r) => {
    const c = computeStudentExam(papers, marksByStudent.get(r.student.id) ?? new Map(), bands);
    return {
      studentId: r.student.id,
      studentName: fullName(r.student.firstName, r.student.middleName, r.student.lastName),
      studentNo: r.student.studentNo,
      percentage: c.percentage,
      grade: c.band?.grade ?? "—",
      points: c.band?.points ?? null,
      remark: c.band?.remark ?? "—",
      subjects: c.rows,
    };
  });
  const ranked = addRanks(rows);

  return {
    meta: {
      id: exam.id,
      name: exam.name,
      date: exam.date,
      yearName: exam.academicYear.name,
      termName: exam.term?.name ?? "—",
      className: exam.class.name,
      streamName: exam.stream?.name ?? "—",
    },
    rows: ranked,
  };
}

/** Per exam average % (class performance over time). */
export async function classPerformanceReport(
  access: SchoolAccess,
  filters: { yearId?: string; termId?: string; classId?: string }
) {
  const examScope = await examScopeWhere(access);
  const where: Prisma.ExamWhereInput = {
    schoolId: access.schoolId,
    status: { not: "ARCHIVED" },
    ...examScope,
    ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
  };

  const exams = await db.exam.findMany({
    where,
    include: {
      academicYear: { select: { name: true } },
      term: { select: { name: true } },
      class: { select: { name: true } },
      stream: { select: { name: true } },
      subjects: { select: { subjectId: true, maxMarks: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const rows: Array<{
    examId: string;
    examName: string;
    date: Date;
    yearName: string;
    termName: string;
    className: string;
    streamName: string;
    sat: number;
    average: number | null;
  }> = [];

  // Single query for every exam's marks instead of one per exam.
  const marksAll = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId: { in: exams.map((e) => e.id) } },
    select: { studentId: true, examId: true, marksObtained: true },
  });
  const marksByExam = new Map<string, Map<string, number>>();
  for (const m of marksAll) {
    let inner = marksByExam.get(m.examId);
    if (!inner) {
      inner = new Map<string, number>();
      marksByExam.set(m.examId, inner);
    }
    inner.set(m.studentId, (inner.get(m.studentId) ?? 0) + m.marksObtained.toNumber());
  }

  for (const exam of exams) {
    const byStudent = marksByExam.get(exam.id) ?? new Map<string, number>();
    const totalMax = exam.subjects.reduce((a, s) => a + s.maxMarks.toNumber(), 0);
    const pcts = [...byStudent.values()]
      .map((v) => (totalMax > 0 ? (v / totalMax) * 100 : 0))
      .sort((a, b) => a - b);
    const average =
      pcts.length > 0 ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
    rows.push({
      examId: exam.id,
      examName: exam.name,
      date: exam.date,
      yearName: exam.academicYear.name,
      termName: exam.term?.name ?? "—",
      className: exam.class.name,
      streamName: exam.stream?.name ?? "—",
      sat: byStudent.size,
      average,
    });
  }
  return { rows };
}

/** Average + count per subject across all students of an exam. */
export async function subjectPerformanceReport(
  access: SchoolAccess,
  filters: { examId?: string; subjectId?: string }
) {
  const examScope = await examScopeWhere(access);
  const examWhere: Prisma.ExamWhereInput = {
    schoolId: access.schoolId,
    status: { not: "ARCHIVED" },
    ...examScope,
    ...(filters.examId ? { id: filters.examId } : {}),
  };

  const exams = await db.exam.findMany({
    where: examWhere,
    include: {
      academicYear: { select: { name: true } },
      term: { select: { name: true } },
      subjects: { include: { subject: { select: { name: true } } } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const rows: Array<{
    examId: string;
    examName: string;
    yearName: string;
    termName: string;
    subjectName: string;
    maxMarks: number;
    sat: number;
    average: number | null;
  }> = [];

  // One query for every exam/subject's marks instead of one per paper.
  const marksAll = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId: { in: exams.map((e) => e.id) } },
    select: { examId: true, subjectId: true, marksObtained: true },
  });
  const marksByPaper = new Map<string, number[]>();
  for (const m of marksAll) {
    const key = `${m.examId}:${m.subjectId}`;
    const arr = marksByPaper.get(key) ?? [];
    arr.push(m.marksObtained.toNumber());
    marksByPaper.set(key, arr);
  }

  for (const exam of exams) {
    for (const paper of exam.subjects) {
      if (filters.subjectId && paper.subjectId !== filters.subjectId) continue;
      const vals = marksByPaper.get(`${exam.id}:${paper.subjectId}`) ?? [];
      const pcts = vals.map((v) => (paper.maxMarks.toNumber() > 0 ? (v / paper.maxMarks.toNumber()) * 100 : 0));
      rows.push({
        examId: exam.id,
        examName: exam.name,
        yearName: exam.academicYear.name,
        termName: exam.term?.name ?? "—",
        subjectName: paper.subject.name,
        maxMarks: paper.maxMarks.toNumber(),
        sat: vals.length,
        average:
          pcts.length > 0 ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
      });
    }
  }
  return { rows };
}

/** One student's performance across exams (per-exam %). */
export async function studentAcademicHistory(
  access: SchoolAccess,
  filters: { studentId: string; yearId?: string }
) {
  const scope = await studentsScopeWhere(access);
  const hasStudent = await db.student.findFirst({
    where: { id: filters.studentId, schoolId: access.schoolId, ...scope },
    select: { id: true },
  });
  if (!hasStudent) return { rows: [] };

  const examScope = await examScopeWhere(access);
  const marks = await db.examMark.findMany({
    where: {
      schoolId: access.schoolId,
      studentId: filters.studentId,
      ...(filters.yearId ? { exam: { academicYearId: filters.yearId } } : {}),
      exam: examScope,
    },
    include: {
      exam: {
        include: {
          academicYear: { select: { name: true } },
          term: { select: { name: true } },
          subjects: true,
        },
      },
    },
  });

  const byExam = new Map<string, { exam: (typeof marks)[0]["exam"]; total: number; max: number }>();
  for (const m of marks) {
    const e = byExam.get(m.examId) ?? { exam: m.exam, total: 0, max: 0 };
    const paper = m.exam.subjects.find((s) => s.subjectId === m.subjectId);
    e.total += m.marksObtained.toNumber();
    e.max += paper ? paper.maxMarks.toNumber() : 0;
    byExam.set(m.examId, e);
  }

  const rows = [...byExam.values()]
    .map((e) => ({
      examId: e.exam.id,
      examName: e.exam.name,
      date: e.exam.date,
      yearName: e.exam.academicYear.name,
      termName: e.exam.term?.name ?? "—",
      percentage: e.max > 0 && e.total > 0 ? Math.round((e.total / e.max) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return { rows };
}

/** Count of students per grade band for an exam. */
export async function gradeDistribution(
  access: SchoolAccess,
  filters: { examId?: string }
) {
  const defaultScale = await db.gradeScale.findFirst({
    where: { schoolId: access.schoolId, isDefault: true },
    include: { bands: true },
  });
  const bands = bandsToView(defaultScale?.bands ?? []);
  if (!filters.examId) return { rows: [], total: 0, bands };

  const exam = await db.exam.findFirst({
    where: {
      id: filters.examId,
      schoolId: access.schoolId,
      status: { not: "ARCHIVED" },
      ...(await examScopeWhere(access)),
    },
    include: { subjects: true },
  });
  if (!exam) return { rows: [], total: 0, bands };

  const marks = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId: exam.id },
    select: { studentId: true, subjectId: true, marksObtained: true },
  });
  const max = exam.subjects.reduce((a, s) => a + s.maxMarks.toNumber(), 0);
  const byStudent = new Map<string, number>();
  for (const m of marks) {
    byStudent.set(m.studentId, (byStudent.get(m.studentId) ?? 0) + m.marksObtained.toNumber());
  }

  const counts = new Map<string, number>();
  for (const v of byStudent.values()) {
    const pct = max > 0 ? (v / max) * 100 : 0;
    const band = gradeFor(bands, pct);
    const label = band ? band.grade : "No grade";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const rows = [...counts.entries()]
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => b.count - a.count);

  return {
    rows,
    total: byStudent.size,
    bands,
  };
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

/** Fee collection rolling-up of applied payments by year/term. */
export async function feeCollectionReport(
  access: SchoolAccess,
  filters: { yearId?: string; termId?: string } & DateFilter
) {
  const studentScope = await financeStudentsScopeWhere(access);
  const where = {
    schoolId: access.schoolId,
    status: "APPLIED" as const,
    ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    ...dayBounds(filters),
    student: studentScope,
  };

  const groups = await db.feePayment.groupBy({
    by: ["academicYearId", "termId"],
    where,
    _sum: { amount: true },
    _count: { amount: true },
  });

  const [years, reversed] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: { terms: { select: { id: true, name: true } } },
      orderBy: { startDate: "desc" },
    }),
    db.feePayment.groupBy({
      by: ["academicYearId", "termId"],
      where: { ...where, status: "REVERSED" },
      _sum: { amount: true },
    }),
  ]);

  const yearName = new Map(years.map((y) => [y.id, y.name]));
  const reversedMap = new Map(reversed.map((r) => [`${r.academicYearId}|${r.termId ?? ""}`, r._sum.amount?.toNumber() ?? 0]));

  const rows = groups.map((g) => {
    const key = `${g.academicYearId}|${g.termId ?? ""}`;
    const collected = g._sum.amount?.toNumber() ?? 0;
    const rev = reversedMap.get(key) ?? 0;
    const y = years.find((y) => y.id === g.academicYearId);
    return {
      yearName: yearName.get(g.academicYearId) ?? "—",
      termName: g.termId ? y?.terms.find((t) => t.id === g.termId)?.name ?? "—" : "Whole year",
      count: g._count.amount,
      collected: roundMoney(collected),
      reversed: roundMoney(rev),
      net: roundMoney(collected - rev),
    };
  });
  rows.sort((a, b) => a.yearName.localeCompare(b.yearName) || a.termName.localeCompare(b.termName));
  return { rows };
}

/** Outstanding balances per student (charges − adjustments − applied payments). */
export async function outstandingReport(
  access: SchoolAccess,
  filters: { yearId?: string; termId?: string; classId?: string; streamId?: string }
) {
  const studentScope = await financeStudentsScopeWhere(access);
  const studentWhere: Prisma.StudentWhereInput = {
    schoolId: access.schoolId,
    archived: false,
    ...studentScope,
    ...(filters.classId || filters.streamId
      ? { enrollments: { some: { status: "ACTIVE", ...(filters.classId ? { classId: filters.classId } : {}), ...(filters.streamId ? { streamId: filters.streamId } : {}) } } }
      : {}),
  };

  const chargeWhere: Prisma.StudentChargeWhereInput = {
    schoolId: access.schoolId,
    ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
    ...(filters.termId ? { termId: filters.termId } : {}),
    student: studentWhere,
  };

  const [students, billed, adjustments, payments] = await Promise.all([
    db.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        studentNo: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: { class: { select: { name: true } }, stream: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.studentCharge.groupBy({
      by: ["studentId"],
      where: chargeWhere,
      _sum: { amount: true },
    }),
    db.chargeAdjustment.findMany({
      where: { schoolId: access.schoolId, charge: chargeWhere },
      select: { studentId: true, amount: true },
    }),
    db.feePayment.groupBy({
      by: ["studentId"],
      where: {
        schoolId: access.schoolId,
        status: "APPLIED",
        ...(filters.yearId ? { academicYearId: filters.yearId } : {}),
        ...(filters.termId ? { termId: filters.termId } : {}),
        student: studentWhere,
      },
      _sum: { amount: true },
    }),
  ]);

  const billedMap = new Map(billed.map((b) => [b.studentId, b._sum.amount?.toNumber() ?? 0]));
  const paidMap = new Map(payments.map((p) => [p.studentId, p._sum.amount?.toNumber() ?? 0]));
  const adjMap = new Map<string, number>();
  for (const a of adjustments) {
    adjMap.set(a.studentId, (adjMap.get(a.studentId) ?? 0) + a.amount.toNumber());
  }

  const rows: Array<{
    studentId: string;
    studentName: string;
    studentNo: string | null;
    className: string;
    streamName: string;
    billed: number;
    adjusted: number;
    paid: number;
    outstanding: number;
  }> = [];

  for (const s of students) {
    const billed = billedMap.get(s.id) ?? 0;
    const adjusted = adjMap.get(s.id) ?? 0;
    const paid = paidMap.get(s.id) ?? 0;
    rows.push({
      studentId: s.id,
      studentName: fullName(s.firstName, s.middleName, s.lastName),
      studentNo: s.studentNo,
      className: s.enrollments[0]?.class?.name ?? "—",
      streamName: s.enrollments[0]?.stream?.name ?? "—",
      billed: roundMoney(billed),
      adjusted: roundMoney(adjusted),
      paid: roundMoney(paid),
      outstanding: roundMoney(billed - adjusted - paid),
    });
  }
  rows.sort((a, b) => b.outstanding - a.outstanding);

  const aboveZero = rows.filter((r) => r.outstanding > 0);
  const totals = aboveZero.reduce(
    (acc, r) => ({
      billed: acc.billed + r.billed,
      adjusted: acc.adjusted + r.adjusted,
      paid: acc.paid + r.paid,
      outstanding: acc.outstanding + r.outstanding,
    }),
    { billed: 0, adjusted: 0, paid: 0, outstanding: 0 }
  );

  return { rows: aboveZero, debtorCount: rows.length, ...totals };
}

/** A single student's statement (reuses the finance ledger builder). */
export async function studentStatementReport(
  access: SchoolAccess,
  filters: { studentId: string } & DateFilter
) {
  const studentScope = await financeStudentsScopeWhere(access);
  const student = await db.student.findFirst({
    where: { id: filters.studentId, schoolId: access.schoolId, ...studentScope },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      studentNo: true,
    },
  });
  if (!student) return { student: null, ledger: null };

  const start = filters.from
    ? (dayRange(filters.from)?.start ?? new Date(0))
    : toDayStartZero();
  const end = filters.to
    ? (dayRange(filters.to)?.end ?? new Date(8640000000000000))
    : new Date(8640000000000000);

  const ledger = await buildStudentLedger(access.schoolId, student.id, start, end);
  return {
    student: {
      id: student.id,
      name: fullName(student.firstName, student.middleName, student.lastName),
      studentNo: student.studentNo,
    },
    ledger,
  };
}

function toDayStartZero(): Date {
  return new Date(0);
}

/** Paginated applied-payment history (scoped to the viewer's students). */
export async function paymentHistoryReport(
  access: SchoolAccess,
  filters: DateFilter & { method?: string; page?: number; take?: number }
) {
  const studentScope = await financeStudentsScopeWhere(access);
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(200, Math.max(1, filters.take ?? 100));

  const where: Prisma.FeePaymentWhereInput = {
    schoolId: access.schoolId,
    status: "APPLIED",
    ...dayBounds(filters),
    ...(filters.method ? { method: filters.method as "CASH" | "BANK" | "CHEQUE" | "OTHER" } : {}),
    student: studentScope,
  };

  const [total, rows] = await Promise.all([
    db.feePayment.count({ where }),
    db.feePayment.findMany({
      where,
      include: {
        class: { select: { name: true } },
        stream: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            studentNo: true,
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      studentId: p.student.id,
      studentName: fullName(p.student.firstName, p.student.middleName, p.student.lastName),
      studentNo: p.student.studentNo,
      date: p.date,
      amount: p.amount.toNumber(),
      method: paymentMethodLabel(p.method),
      methodRaw: p.method,
      referenceNo: p.referenceNo,
      className: p.class?.name ?? "—",
      streamName: p.stream?.name ?? "—",
    })),
  };
}

/** Payment method summary (count + amount per method). */
export async function paymentMethodSummary(
  access: SchoolAccess,
  filters: DateFilter
) {
  const studentScope = await financeStudentsScopeWhere(access);
  const where: Prisma.FeePaymentWhereInput = {
    schoolId: access.schoolId,
    status: "APPLIED",
    ...dayBounds(filters),
    student: studentScope,
  };

  const methodGroups = await db.feePayment.groupBy({
    by: ["method"],
    where,
    _sum: { amount: true },
    _count: { amount: true },
  });

  const rows = methodGroups
    .map((g) => ({
      method: g.method,
      label: paymentMethodLabel(g.method),
      amount: g._sum.amount?.toNumber() ?? 0,
      count: g._count.amount,
      pct: 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const total = rows.reduce((a, r) => a + r.amount, 0);
  for (const r of rows) {
    r.pct = total > 0 ? (r.amount / total) * 100 : 0;
  }

  return { rows };
}

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

/** Announcement activity with publish status/filters. */
export async function announcementsReport(
  access: SchoolAccess,
  filters: { status?: string; page?: number; take?: number }
) {
  const visible = await visibleAnnouncementsWhere(access);
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(100, Math.max(1, filters.take ?? 50));

  const where: Prisma.AnnouncementWhereInput = {
    ...visible,
    ...(filters.status
      ? { status: filters.status as "DRAFT" | "PUBLISHED" | "ARCHIVED" }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.announcement.count({ where }),
    db.announcement.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
      },
      orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * take,
      take,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / take)),
    rows: rows.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      audience: a.audience,
      authorName: a.createdBy.name,
      publishedAt: a.publishAt,
      expiresAt: a.expiresAt,
    })),
  };
}

/** Message volume per conversation within a range. */
export async function messageActivityReport(
  access: SchoolAccess,
  filters: DateFilter & { page?: number; take?: number }
) {
  const page = Math.max(1, filters.page ?? 1);
  const take = Math.min(100, Math.max(1, filters.take ?? 50));

  const conversationIds = await conversationsInScope(access);
  const dateBounds_ = dayBounds(filters);

  const where: Prisma.MessageWhereInput = {
    schoolId: access.schoolId,
    conversationId: { in: conversationIds },
    ...dateBounds_,
  };

  const [total, byConversation] = await Promise.all([
    db.message.count({ where }),
    db.message.groupBy({
      by: ["conversationId"],
      where,
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),
  ]);

  const conversations = await db.conversation.findMany({
    where: { id: { in: conversationIds } },
    include: {
      participants: {
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });
  const convKm = new Map(conversations.map((c) => [c.id, c]));

  const rows = byConversation
    .map((g) => {
      const conv = convKm.get(g.conversationId);
      return {
        conversationId: g.conversationId,
        members: (conv?.participants ?? [])
          .map((p) => p.user.name)
          .join(", "),
        count: g._count._all,
        firstAt: g._min.createdAt,
        lastAt: g._max.createdAt,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { total, page, totalPages: 1, rows: rows.slice((page - 1) * take, page * take) };
}

async function conversationsInScope(access: SchoolAccess): Promise<string[]> {
  const { user, membership } = access;
  const where: Prisma.ConversationWhereInput = {
    schoolId: access.schoolId,
    ...(membership?.role === "STUDENT" || membership?.role === "PARENT" || membership?.role === "TEACHER"
      ? { participants: { some: { userId: user.id } } }
      : {}),
  };
  const rows = await db.conversation.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Notification volume by type (in-app activity), optional range. */
export async function notificationActivityReport(
  access: SchoolAccess,
  filters: DateFilter
) {
  const where: Prisma.NotificationWhereInput = {
    schoolId: access.schoolId,
    ...dayBounds(filters),
  };
  const groups = await db.notification.groupBy({
    by: ["type"],
    where,
    _count: { _all: true },
  });
  const rows = groups
    .map((g) => ({ type: g.type, count: g._count._all }))
    .sort((a, b) => b.count - a.count);
  return {
    rows,
    total: rows.reduce((a, r) => a + r.count, 0),
  };
}

// Re-exported helpers used by the report pages for filter dropdowns.
export { teacherAssignmentPairs, scopeStudentIds, roundMoney as roundMoneyForReports };