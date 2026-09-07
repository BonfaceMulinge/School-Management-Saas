"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { resolveEnrollmentTarget } from "@/server/services/students";
import { notifyGuardiansOfStudent } from "@/server/services/communication";
import {
  attendanceRoster,
  attendanceScopeWhere,
  canManageAttendanceFor,
  dayRange,
} from "@/server/services/attendance";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { AttendanceStatus } from "@/generated/prisma/client";

const statusEnum = z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

function revalidateAll(slug: string) {
  revalidatePath(`/${slug}/attendance`);
  revalidatePath(`/${slug}/attendance/history`);
  revalidatePath(`/${slug}/attendance/reports`);
  revalidatePath(`/${slug}`);
}

/** Extract `name[id]` style form entries (e.g. status[i4hw...]). */
function indexedEntries(
  input: FormData,
  prefix: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of input.entries()) {
    if (!key.startsWith(`${prefix}[`)) continue;
    const id = key.slice(prefix.length + 1, -1);
    if (id) map.set(id, String(value));
  }
  return map;
}

export async function markAttendance(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ created: number; updated: number }>> {
  const access = await assertPermission(schoolSlug, "attendance:manage");

  const dateStr = String(input.get("date") ?? "");
  const classId = String(input.get("classId") ?? "");
  const streamId = input.get("streamId") ? String(input.get("streamId")) : null;
  const academicYearId = String(input.get("academicYearId") ?? "");
  const termId = input.get("termId") ? String(input.get("termId")) : null;

  const range = dayRange(dateStr);
  if (!range) return fail("Enter a valid date.");

  const target = await resolveEnrollmentTarget(
    access.schoolId,
    classId,
    academicYearId,
    streamId,
    termId
  );
  if (!target) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  if (!(await canManageAttendanceFor(access, target.classId, target.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }

  const statuses = indexedEntries(input, "status");
  const notes = indexedEntries(input, "note");
  if (statuses.size === 0) {
    return fail("No student attendance was submitted.");
  }

  // Validate every submitted status and note.
  const values = new Map<string, { status: AttendanceStatus; note: string | null }>();
  for (const [studentId, rawStatus] of statuses) {
    const parsed = statusEnum.safeParse(rawStatus);
    if (!parsed.success) {
      return fail(`Invalid attendance status for student ${studentId}.`);
    }
    const note = notes.get(studentId)?.trim() || null;
    values.set(studentId, { status: parsed.data, note });
  }

  // The submitted students must be part of the current roster for the target;
  // otherwise a teacher could forge records for students they don't teach.
  const roster = await attendanceRoster(
    access.schoolId,
    target.classId,
    target.academicYearId,
    target.streamId,
    target.termId
  );
  const rosterById = new Map(roster.map((r) => [r.student.id, r]));
  for (const studentId of values.keys()) {
    if (!rosterById.has(studentId)) {
      return fail("One or more students are not enrolled in this class/stream.");
    }
  }

  // Fetch existing records for the day to detect changes (audit trail).
  const existing = await db.attendance.findMany({
    where: {
      schoolId: access.schoolId,
      date: { gte: range.start, lt: range.end },
      studentId: { in: [...values.keys()] },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      note: true,
      classId: true,
      streamId: true,
      academicYearId: true,
      termId: true,
      enrollmentId: true,
    },
  });
  const existingByStudent = new Map(existing.map((r) => [r.studentId, r]));

  let created = 0;
  let updated = 0;
  const absentStudents: { id: string; name: string }[] = [];

  await db.$transaction(async (tx) => {
    for (const [studentId, value] of values) {
      const row = existingByStudent.get(studentId);
      const enrollmentId = rosterById.get(studentId)?.id ?? null;

      if (!row) {
        await tx.attendance.create({
          data: {
            schoolId: access.schoolId,
            studentId,
            recordedById: access.user.id,
            date: range.start,
            status: value.status,
            note: value.note,
            academicYearId: target.academicYearId,
            termId: target.termId,
            classId: target.classId,
            streamId: target.streamId,
            enrollmentId,
          },
        });
        created += 1;
        if (value.status === "ABSENT") {
          const rosterRow = rosterById.get(studentId);
          const student = rosterRow?.student;
          const name = student
            ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")
            : "A student";
          absentStudents.push({ id: studentId, name });
        }
        continue;
      }

      const changed =
        row.status !== value.status ||
        (row.note ?? null) !== value.note ||
        row.classId !== target.classId ||
        (row.streamId ?? null) !== target.streamId ||
        row.academicYearId !== target.academicYearId ||
        (row.termId ?? null) !== target.termId;

      if (changed) {
        await tx.attendance.update({
          where: { id: row.id },
          data: {
            status: value.status,
            note: value.note,
            recordedById: access.user.id,
            academicYearId: target.academicYearId,
            termId: target.termId,
            classId: target.classId,
            streamId: target.streamId,
            enrollmentId,
          },
        });
        await tx.attendanceChange.create({
          data: {
            attendanceId: row.id,
            schoolId: access.schoolId,
            changedById: access.user.id,
            oldStatus: row.status,
            newStatus: value.status,
            oldNote: row.note,
            newNote: value.note,
            reason: `Amended on the ${target.streamId ? "stream" : "class"} register.`,
          },
        });
        updated += 1;
        if (value.status === "ABSENT" && row.status !== "ABSENT") {
          const rosterRow = rosterById.get(studentId);
          const student = rosterRow?.student;
          const name = student
            ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")
            : "A student";
          absentStudents.push({ id: studentId, name });
        }
      }
    }
  });

  for (const record of absentStudents) {
    await notifyGuardiansOfStudent(access.schoolId, record.id, {
      type: "ATTENDANCE_ALERT",
      title: "Attendance alert",
      message: `${record.name} was marked absent on ${dateStr}.`,
      link: `/${schoolSlug}/attendance/history`,
    });
  }

  revalidateAll(schoolSlug);
  return ok({ created, updated });
}

export async function updateAttendanceRecord(
  schoolSlug: string,
  attendanceId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "attendance:manage");

  const scope = await attendanceScopeWhere(access);
  const row = await db.attendance.findFirst({
    where: { id: attendanceId, schoolId: access.schoolId, ...scope },
    select: {
      id: true,
      studentId: true,
      status: true,
      note: true,
      classId: true,
      streamId: true,
    },
  });
  if (!row) return fail("Attendance record not found.");

  if (!(await canManageAttendanceFor(access, row.classId, row.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }

  const parsed = z
    .object({
      status: statusEnum,
      note: z.string().trim().max(500).optional().nullable(),
      reason: z.string().trim().max(500).optional(),
    })
    .safeParse({
      status: input.get("status") ?? "",
      note: input.get("note") ? String(input.get("note")).trim() : null,
      reason: input.get("reason") ? String(input.get("reason")).trim() : "",
    });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  const { status, note, reason } = parsed.data;
  const changedStatus = status !== row.status;
  const noteBefore = row.note ?? null;

  // Corrections of an existing status must be justified so the change is
  // auditable, not silently overwritten.
  if (changedStatus && !reason) {
    return fail("A reason is required when changing attendance status.");
  }

  const changed = changedStatus || (note ?? null) !== noteBefore;
  if (!changed) return ok();

  await db.$transaction([
    db.attendance.update({
      where: { id: attendanceId },
      data: {
        status,
        note: note ?? null,
        recordedById: access.user.id,
      },
    }),
    db.attendanceChange.create({
      data: {
        attendanceId,
        schoolId: access.schoolId,
        changedById: access.user.id,
        oldStatus: row.status,
        newStatus: changedStatus ? status : null,
        oldNote: noteBefore,
        newNote: note ?? null,
        reason: reason ?? null,
      },
    }),
  ]);

  revalidateAll(schoolSlug);
  return ok();
}