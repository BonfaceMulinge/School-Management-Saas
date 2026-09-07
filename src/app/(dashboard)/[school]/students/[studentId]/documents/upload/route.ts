import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { uploadStudentDocument } from "@/server/actions/documents";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ school: string; studentId: string }> }
) {
  const { school: slug, studentId } = await params;
  await requirePermission(slug, "documents:manage", { next: `/${slug}` });
  const formData = await req.formData();
  formData.set("studentId", studentId);
  const result = await uploadStudentDocument(slug, studentId, formData);
  return NextResponse.json(result);
}