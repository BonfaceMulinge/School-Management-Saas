"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { resolveEnrollmentTarget } from "@/server/services/students";
import {
  canManageExamFor,
  canManageSubjectFor,
  examRoster,
  findDuplicateExam,
} from "@/server/services/exams";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { dayRange } from "@/server/services/attendance";
import { storage } from "@/server/services/storage";
import { Prisma } from "@/generated/prisma/client";

const typeEnum = z.enum(["CAT", "MIDTERM", "END_TERM", "ASSIGNMENT"]);
const statusEnum = z.enum(["DRAFT", "SCHEDULED", "ONGOING", "COMPLETED", "ARCHIVED"]);
const MAX_MARKS_LIMIT = new Prisma.Decimal("999.99");

const PAPER_MAX_BYTES = 10 * 1024 * 1024;
const PAPER_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

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

const maxMarksPattern = /^\d{1,3}(\.\d{1,2})?$/;

function parseExamForm(input: FormData) {
  return z
    .object({
      name: z.string().trim().min(1, "Name is required.").max(120),
      type: typeEnum,
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
      academicYearId: z.string().min(1, "Academic year is required."),
      termId: z.string().min(1, "Term is required."),
      classId: z.string().min(1, "Class is required."),
      streamId: z.string().optional().nullable(),
      status: statusEnum,
    })
    .safeParse({
      name: input.get("name") ?? "",
      type: input.get("type") ?? "",
      date: input.get("date") ?? "",
      academicYearId: input.get("academicYearId") ?? "",
      termId: input.get("termId") ?? "",
      classId: input.get("classId") ?? "",
      streamId: input.get("streamId") ? String(input.get("streamId")) : null,
      status: input.get("status") ?? "SCHEDULED",
    });
}

type SubjectRow = { key: string; subjectId: string; maxMarks: Prisma.Decimal };

/**
 * Parse `subjectId[<key>]` / `maxMarks[<key>]` rows and validate that every
 * subject belongs to the tenant, is not archived, and is not repeated.
 * Also verifies (for teachers) that the subject is part of their assignment.
 */
async function parseSubjectRows(
  access: Awaited<ReturnType<typeof assertPermission>>,
  input: FormData,
  classId: string,
  streamId: string | null
): Promise<{ ok: true; rows: SubjectRow[] } | { ok: false; error: string }> {
  const idMap = indexedEntries(input, "subjectId");
  const marksMap = indexedEntries(input, "maxMarks");
  const rows: SubjectRow[] = [];
  const seen = new Set<string>();

  for (const [key, subjectId] of idMap) {
    const rawSubjectId = subjectId.trim();
    if (!rawSubjectId) continue;
    if (seen.has(rawSubjectId)) {
      return { ok: false, error: "The same subject cannot appear twice in one exam." };
    }
    seen.add(rawSubjectId);

    const rawMax = (marksMap.get(key) ?? "").trim();
    if (!maxMarksPattern.test(rawMax)) {
      return { ok: false, error: "Enter a valid maximum marks value for each subject." };
    }
    const maxMarks = new Prisma.Decimal(rawMax);
    if (maxMarks.lte(0) || maxMarks.gt(MAX_MARKS_LIMIT)) {
      return { ok: false, error: "Maximum marks must be above 0 and at most 999.99." };
    }

    const subject = await db.subject.findFirst({
      where: { id: rawSubjectId, schoolId: access.schoolId, archived: false },
      select: { id: true },
    });
    if (!subject) {
      return { ok: false, error: "One or more selected subjects are invalid." };
    }
    if (!(await canManageSubjectFor(access, rawSubjectId, classId, streamId))) {
      return { ok: false, error: "You are not assigned to one of the selected subjects for this class/stream." };
    }
    rows.push({ key, subjectId: rawSubjectId, maxMarks });
  }

  if (rows.length === 0) {
    return { ok: false, error: "Add at least one subject to the exam." };
  }
  return { ok: true, rows };
}

function revalidateExamPaths(slug: string, examId?: string) {
  revalidatePath(`/${slug}/exams`);
  revalidatePath(`/${slug}/exams/${examId ?? ""}`);
  revalidatePath(`/${slug}/results`);
  revalidatePath(`/${slug}/results/reports`);
}

export async function createExam(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const parsed = parseExamForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const range = dayRange(data.date);
  if (!range) return fail("Enter a valid date.");

  const resolved = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!resolved) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  if (!(await canManageExamFor(access, resolved.classId, resolved.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }

  const subjects = await parseSubjectRows(access, input, resolved.classId, resolved.streamId);
  if (!subjects.ok) return fail(subjects.error);

  if (await findDuplicateExam(access.schoolId, {
    name: data.name,
    academicYearId: resolved.academicYearId,
    termId: resolved.termId ?? data.termId,
    classId: resolved.classId,
    streamId: resolved.streamId,
  })) {
    return fail("An exam with this name already exists for the same year, term, class and stream.");
  }

  const created = await db.exam.create({
    data: {
      schoolId: access.schoolId,
      name: data.name,
      type: data.type,
      date: range.start,
      academicYearId: resolved.academicYearId,
      termId: resolved.termId ?? data.termId,
      classId: resolved.classId,
      streamId: resolved.streamId,
      status: data.status === "ARCHIVED" ? "SCHEDULED" : data.status,
      createdById: access.user.id,
      subjects: {
        create: subjects.rows.map((r, i) => ({
          subjectId: r.subjectId,
          maxMarks: r.maxMarks,
          sortOrder: i,
        })),
      },
    },
    select: { id: true },
  });

  revalidateExamPaths(schoolSlug, created.id);
  return ok({ id: created.id });
}

export async function updateExam(
  schoolSlug: string,
  examId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const exam = await db.exam.findUnique({
    where: { id: examId, schoolId: access.schoolId },
    include: {
      subjects: {
        include: {
          subject: { select: { name: true } },
          _count: { select: { marks: true } },
        },
      },
    },
  });
  if (!exam) return fail("Exam not found.");
  if (exam.status === "ARCHIVED") {
    return fail("Archived exams cannot be edited.");
  }

  const parsed = parseExamForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data;

  const range = dayRange(data.date);
  if (!range) return fail("Enter a valid date.");

  const resolved = await resolveEnrollmentTarget(
    access.schoolId,
    data.classId,
    data.academicYearId,
    data.streamId,
    data.termId
  );
  if (!resolved) {
    return fail("The selected class, stream, year or term is invalid.");
  }

  if (!(await canManageExamFor(access, resolved.classId, resolved.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }

  const hasMarks = exam.subjects.some((s) => s._count.marks > 0);
  const targetChanged =
    exam.academicYearId !== resolved.academicYearId ||
    exam.termId !== resolved.termId ||
    exam.classId !== resolved.classId ||
    (exam.streamId ?? null) !== resolved.streamId;
  if (targetChanged && hasMarks) {
    return fail("This exam already has recorded marks, so its year, term, class or stream cannot change.");
  }

  if (await findDuplicateExam(
    access.schoolId,
    {
      name: data.name,
      academicYearId: resolved.academicYearId,
      termId: resolved.termId ?? data.termId,
      classId: resolved.classId,
      streamId: resolved.streamId,
    },
    examId
  )) {
    return fail("An exam with this name already exists for the same year, term, class and stream.");
  }

  const subjects = await parseSubjectRows(access, input, resolved.classId, resolved.streamId);
  if (!subjects.ok) return fail(subjects.error);

  // Removed subjects / changed max marks are only allowed when untouched.
  const incomingBySubject = new Map(subjects.rows.map((r) => [r.subjectId, r]));
  for (const s of exam.subjects) {
    const incoming = incomingBySubject.get(s.subjectId);
    if (!incoming) {
      if (s._count.marks > 0) {
        return fail(`"${s.subject.name}" already has recorded marks and cannot be removed.`);
      }
    } else if (!incoming.maxMarks.equals(s.maxMarks) && s._count.marks > 0) {
      return fail(`"${s.subject.name}" already has recorded marks; adjust its maximum marks by editing the existing marks instead.`);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id: examId },
      data: {
        name: data.name,
        type: data.type,
        date: range.start,
        academicYearId: resolved.academicYearId,
        termId: resolved.termId ?? data.termId,
        classId: resolved.classId,
        streamId: resolved.streamId,
        status: data.status === "ARCHIVED" ? exam.status : data.status,
        updatedById: access.user.id,
      },
    });

    for (const s of exam.subjects) {
      const incoming = incomingBySubject.get(s.subjectId);
      if (!incoming) {
        await tx.examSubject.delete({ where: { id: s.id } });
      } else if (!incoming.maxMarks.equals(s.maxMarks)) {
        await tx.examSubject.update({
          where: { id: s.id },
          data: { maxMarks: incoming.maxMarks },
        });
      }
    }

    const existingIds = new Set(exam.subjects.map((s) => s.subjectId));
    let order = 0;
    for (const incoming of subjects.rows) {
      if (existingIds.has(incoming.subjectId)) continue;
      await tx.examSubject.create({
        data: {
          examId,
          subjectId: incoming.subjectId,
          maxMarks: incoming.maxMarks,
          sortOrder: order,
        },
      });
      order += 1;
    }
  });

  revalidateExamPaths(schoolSlug, examId);
  return ok();
}

export async function archiveExam(
  schoolSlug: string,
  examId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const exam = await db.exam.findUnique({
    where: { id: examId, schoolId: access.schoolId },
    select: { id: true, status: true, classId: true, streamId: true },
  });
  if (!exam) return fail("Exam not found.");
  if (exam.status === "ARCHIVED") return fail("This exam is already archived.");

  if (!(await canManageExamFor(access, exam.classId, exam.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }

  await db.exam.update({
    where: { id: examId },
    data: { status: "ARCHIVED", updatedById: access.user.id },
  });

  revalidateExamPaths(schoolSlug, examId);
  return ok();
}

export async function saveMarks(
  schoolSlug: string,
  examId: string,
  examSubjectId: string,
  input: FormData
): Promise<ActionResult<{ saved: number; updated: number }>> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const exam = await db.exam.findUnique({
    where: { id: examId, schoolId: access.schoolId },
    include: {
      subjects: {
        where: { id: examSubjectId },
        include: { subject: { select: { id: true, archived: true } } },
      },
    },
  });
  if (!exam || exam.subjects.length !== 1) {
    return fail("Exam or subject paper not found.");
  }
  const paper = exam.subjects[0];
  if (paper.subject.archived) {
    return fail("This subject is archived and can no longer receive marks.");
  }
  if (exam.status === "ARCHIVED") {
    return fail("Archived exams can no longer receive marks.");
  }

  if (!(await canManageExamFor(access, exam.classId, exam.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }
  if (!(await canManageSubjectFor(access, paper.subjectId, exam.classId, exam.streamId))) {
    return fail("You are not assigned to teach this subject in this class/stream.");
  }

  const roster = await examRoster(exam);
  const rosterById = new Map(roster.map((r) => [r.student.id, r]));

  const rawMarks = indexedEntries(input, "mark");
  if (rawMarks.size === 0) return fail("No marks were submitted.");

  const values = new Map<string, Prisma.Decimal>();
  for (const [studentId, raw] of rawMarks) {
    if (!rosterById.has(studentId)) {
      return fail("One or more students are not part of this exam's register.");
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!maxMarksPattern.test(trimmed)) {
      return fail("Enter marks as a number with up to two decimals.");
    }
    const value = new Prisma.Decimal(trimmed);
    if (value.isNegative() || value.gt(paper.maxMarks)) {
      return fail(`Marks must be between 0 and the subject maximum (${paper.maxMarks}).`);
    }
    values.set(studentId, value);
  }
  if (values.size === 0) return fail("No marks were submitted.");

  const existing = await db.examMark.findMany({
    where: { schoolId: access.schoolId, examId, examSubjectId },
    select: { id: true, studentId: true, marksObtained: true },
  });
  const existingByStudent = new Map(existing.map((m) => [m.studentId, m]));

  let saved = 0;
  let updated = 0;

  await db.$transaction(async (tx) => {
    for (const [studentId, value] of values) {
      const current = existingByStudent.get(studentId);
      if (!current) {
        await tx.examMark.create({
          data: {
            schoolId: access.schoolId,
            examId,
            examSubjectId,
            subjectId: paper.subjectId,
            studentId,
            enrollmentId: rosterById.get(studentId)?.id ?? null,
            marksObtained: value,
            recordedById: access.user.id,
          },
        });
        saved += 1;
      } else if (!current.marksObtained.equals(value)) {
        await tx.examMark.update({
          where: { id: current.id },
          data: { marksObtained: value, updatedById: access.user.id },
        });
        updated += 1;
      }
    }
  });

  revalidateExamPaths(schoolSlug, examId);
  return ok({ saved, updated });
}

export async function clearMark(
  schoolSlug: string,
  examId: string,
  examSubjectId: string,
  markId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const mark = await db.examMark.findFirst({
    where: {
      id: markId,
      schoolId: access.schoolId,
      examId,
      examSubjectId,
    },
    include: { exam: { select: { status: true, classId: true, streamId: true } } },
  });
  if (!mark) return fail("Mark not found.");

  const exam = mark.exam;
  if (exam.status === "ARCHIVED") return fail("Archived exams can no longer be edited.");
  if (!(await canManageExamFor(access, exam.classId, exam.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }
  if (!(await canManageSubjectFor(access, mark.subjectId, exam.classId, exam.streamId))) {
    return fail("You are not assigned to teach this subject in this class/stream.");
  }

  await db.examMark.delete({ where: { id: mark.id } });

  revalidateExamPaths(schoolSlug, examId);
  return ok();
}

export async function deleteExam(schoolSlug: string, examId: string): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const exam = await db.exam.findUnique({
    where: { id: examId, schoolId: access.schoolId },
    include: { _count: { select: { marks: true } } },
  });
  if (!exam) return fail("Exam not found.");
  if (exam._count.marks > 0) {
    return fail("This exam has recorded marks and cannot be deleted. Archive it instead.");
  }

  await db.exam.delete({ where: { id: examId } });

  revalidateExamPaths(schoolSlug, examId);
  return ok();
}

/**
 * Upload (or replace) the exam-paper document for one subject paper of an
 * exam. Only the teacher assigned to that subject in the exam's class/stream
 * (or an administrator) may upload. Storing replaces any previous paper file
 * for the same subject, which is removed from storage first.
 */
export async function uploadExamPaper(
  schoolSlug: string,
  examId: string,
  subjectId: string,
  input: FormData
): Promise<ActionResult<{ fileName: string; sizeBytes: number }>> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const exam = await db.exam.findFirst({
    where: { id: examId, schoolId: access.schoolId },
    include: { subjects: { where: { subjectId }, include: { subject: { select: { archived: true } } } } },
  });
  if (!exam || exam.subjects.length !== 1) {
    return fail("Exam or subject paper not found.");
  }
  const paper = exam.subjects[0];
  if (paper.subject.archived) {
    return fail("This subject is archived and can no longer receive an exam paper.");
  }
  if (exam.status === "ARCHIVED") {
    return fail("Archived exams can no longer receive exam papers.");
  }
  if (!(await canManageExamFor(access, exam.classId, exam.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }
  if (!(await canManageSubjectFor(access, subjectId, exam.classId, exam.streamId))) {
    return fail("You are not assigned to teach this subject in this class/stream.");
  }

  const file = input.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a file to upload.", { file: ["Pick a file."] });
  }
  if (file.size > PAPER_MAX_BYTES) {
    return fail("The file is larger than the 10 MB limit.", { file: ["File too large."] });
  }
  if (!PAPER_ALLOWED_MIME.has(file.type)) {
    return fail("This file type is not allowed (PDF, PNG or JPEG).", {
      file: ["Unsupported file type."],
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await storage.put({
    data: bytes,
    mimeType: file.type,
    sizeBytes: file.size,
  });
  if (!stored) {
    return fail("File storage is unavailable — the paper was not saved.");
  }

  const fileName = file.name ? file.name.slice(0, 255) : `paper.${file.type.split("/")[1] ?? "pdf"}`;

  const existing = await db.examPaper.findFirst({
    where: { examId, subjectId, exam: { schoolId: access.schoolId } },
    select: { id: true, storageKey: true },
  });

  if (existing) {
    await db.examPaper.update({
      where: { id: existing.id },
      data: { fileName, storageKey: stored.key, mimeType: file.type, sizeBytes: file.size },
    });
    await storage.remove(existing.storageKey);
  } else {
    await db.examPaper.create({
      data: {
        examId,
        subjectId,
        fileName,
        storageKey: stored.key,
        mimeType: file.type,
        sizeBytes: file.size,
        uploadedById: access.user.id,
      },
    });
  }

  revalidateExamPaths(schoolSlug, examId);
  return ok({ fileName, sizeBytes: file.size });
}

/**
 * Remove the exam-paper document for a subject paper. Blocked once the exam
 * is archived, mirroring the marks-entry lock.
 */
export async function deleteExamPaper(
  schoolSlug: string,
  examId: string,
  subjectId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "exams:manage");

  const paper = await db.examPaper.findFirst({
    where: { examId, subjectId, exam: { schoolId: access.schoolId } },
    include: { exam: { select: { status: true, classId: true, streamId: true } } },
  });
  if (!paper) return fail("Exam paper not found.");
  if (paper.exam.status === "ARCHIVED") {
    return fail("Archived exams can no longer have papers removed.");
  }
  if (!(await canManageExamFor(access, paper.exam.classId, paper.exam.streamId))) {
    return fail("You are not assigned to this class/stream.");
  }
  if (!(await canManageSubjectFor(access, subjectId, paper.exam.classId, paper.exam.streamId))) {
    return fail("You are not assigned to teach this subject in this class/stream.");
  }

  await db.examPaper.delete({ where: { id: paper.id } });
  await storage.remove(paper.storageKey);

  revalidateExamPaths(schoolSlug, examId);
  return ok();
}