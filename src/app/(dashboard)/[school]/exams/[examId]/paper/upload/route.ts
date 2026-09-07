import { NextResponse } from "next/server";
import { requirePermission } from "@/server/authorization";
import { uploadExamPaper } from "@/server/actions/exams";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ school: string; examId: string }> }
) {
  const { school: slug, examId } = await params;
  await requirePermission(slug, "exams:manage", { next: `/${slug}` });
  const formData = await req.formData();
  const subjectId = String(formData.get("subjectId") ?? "");
  const result = await uploadExamPaper(slug, examId, subjectId, formData);
  return NextResponse.json(result);
}