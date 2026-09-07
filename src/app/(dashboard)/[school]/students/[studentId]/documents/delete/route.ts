import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { deleteStudentDocument } from "@/server/actions/documents";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ school: string; studentId: string }> }
) {
  const { school: slug } = await params;
  await requirePermission(slug, "documents:manage", { next: `/${slug}` });
  const formData = await req.formData();
  const documentId = formData.get("documentId");
  if (!documentId || typeof documentId !== "string") {
    return NextResponse.json({ ok: false, error: "Document ID required" }, { status: 400 });
  }
  const result = await deleteStudentDocument(slug, documentId);
  return NextResponse.json(result);
}