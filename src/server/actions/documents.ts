"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { storage } from "@/server/services/storage";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { DocumentType } from "@/generated/prisma/client";

const documentTypeEnum = z.nativeEnum(DocumentType);

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
]);

export type DocumentUploadResult =
  | { ok: true }
  | { ok: false; error: string };

export async function uploadStudentDocument(
  schoolSlug: string,
  studentId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "documents:manage");

  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: access.schoolId, archived: false },
    select: { id: true },
  });
  if (!student) return fail("Student not found.");

  const title = String(input.get("title") ?? "").trim();
  const typeRaw = String(input.get("type") ?? "");
  const description = String(input.get("description") ?? "").trim();

  const type = documentTypeEnum.safeParse(typeRaw);
  if (!type.success) return fail("Choose a valid document type.");
  if (!title) return fail("A document title is required.", { title: ["Add a title."] });
  if (title.length > 200) return fail("Title is too long.");
  if (description.length > 1000) return fail("Description is too long.");

  const file = input.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a file to upload.", { file: ["Pick a file."] });
  }
  if (file.size > MAX_BYTES) {
    return fail("The file is larger than the 10 MB limit.", { file: ["File too large."] });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return fail("This file type is not allowed (PDF, PNG, JPEG or text).", {
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
    return fail(
      "No storage provider is configured — the file was not saved and no document was recorded."
    );
  }

  await db.studentDocument.create({
    data: {
      schoolId: access.schoolId,
      studentId,
      type: type.data,
      title,
      description: description || null,
      storageKey: stored.key,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: access.user.id,
    },
  });

  revalidatePath(`/${schoolSlug}/students/${studentId}/documents`);
  return ok();
}

export async function deleteStudentDocument(
  schoolSlug: string,
  documentId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "documents:manage");

  const doc = await db.studentDocument.findFirst({
    where: { id: documentId, schoolId: access.schoolId },
    select: { id: true, studentId: true },
  });
  if (!doc) return fail("Document not found.");

  await db.studentDocument.delete({ where: { id: doc.id } });

  revalidatePath(`/${schoolSlug}/students/${doc.studentId}/documents`);
  return ok();
}