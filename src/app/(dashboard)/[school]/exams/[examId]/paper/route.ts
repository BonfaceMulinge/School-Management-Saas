import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { examScopeWhere } from "@/server/services/exams";
import { storage } from "@/server/services/storage";

export const dynamic = "force-dynamic";

/**
 * Stream an exam-paper document. School admins and platform staff may read any
 * paper in the tenant; teachers only those within their assignment scope
 * (examScopeWhere). Parents and students are denied unconditionally — exam
 * papers must never reach guardians/learners. `?download=1` forces an
 * attachment; otherwise the file streams inline (for viewing/printing).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ school: string; examId: string }> }
) {
  const { school: slug, examId } = await params;
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId");
  if (!subjectId) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }

  const access = await requirePermission(slug, "exams:view", { next: `/${slug}` });

  if (
    !access.isPlatformStaff &&
    (access.membership?.role === "STUDENT" || access.membership?.role === "PARENT")
  ) {
    return NextResponse.json({ error: "Exam papers are not available to you." }, { status: 403 });
  }

  const scope = await examScopeWhere(access);
  const paper = await db.examPaper.findFirst({
    where: { examId, subjectId, exam: { schoolId: access.schoolId, ...scope } },
    select: { fileName: true, storageKey: true, mimeType: true, sizeBytes: true },
  });
  if (!paper) {
    return NextResponse.json({ error: "Paper not found." }, { status: 404 });
  }

  const data = await storage.get(paper.storageKey);
  if (!data) {
    return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  }

  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  const escaped = Array.from(paper.fileName)
    .map((c) =>
      /^[\x20-\x7E]$/.test(c) && c !== '"' && c !== "\\" && c !== "\n" && c !== "\r"
        ? c
        : `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`
    )
    .join("");

  return new NextResponse(new Blob([new Uint8Array(data)]), {
    status: 200,
    headers: {
      "Content-Type": paper.mimeType,
      "Content-Disposition": `${disposition}; filename="${escaped}"; filename*=UTF-8''${encodeURIComponent(paper.fileName)}`,
      "Content-Length": String(paper.sizeBytes),
      "Cache-Control": "no-store",
    },
  });
}