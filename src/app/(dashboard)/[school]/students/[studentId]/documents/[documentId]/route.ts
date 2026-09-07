import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { canViewStudentDocuments } from "@/server/services/documents";
import { storage } from "@/server/services/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ school: string; studentId: string; documentId: string }> }
) {
  const { school: slug, studentId, documentId } = await params;
  const access = await requirePermission(slug, "documents:view", { next: `/${slug}` });

  const allowed = await canViewStudentDocuments(access, studentId);
  if (!allowed) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const document = await db.studentDocument.findFirst({
    where: { id: documentId, studentId, schoolId: access.schoolId },
    select: { storageKey: true, title: true, mimeType: true },
  });
  if (!document?.storageKey) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const bytes = await storage.get(document.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "Stored file is unavailable." }, { status: 404 });
  }

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `attachment; filename="${document.title.replace(/[^a-zA-Z0-9._-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}