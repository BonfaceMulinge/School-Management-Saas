import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type { Prisma } from "@/generated/prisma/client";
import { studentsScopeWhere } from "@/server/services/students";

/**
 * Scope private student documents by the viewer's student visibility. Reuses
 * the exact student boundary from the student module so parents only see their
 * linked children, students only their own records and teachers only students
 * in their assigned classes — no document leaks across those boundaries.
 */
export async function documentsScopeWhere(
  access: SchoolAccess
): Promise<Prisma.StudentDocumentWhereInput> {
  const studentScope = await studentsScopeWhere(access);
  return { student: studentScope };
}

/**
 * Whether the viewer may see documents of a specific student (re-checks the
 * student-level scope).
 */
export async function canViewStudentDocuments(
  access: SchoolAccess,
  studentId: string
): Promise<boolean> {
  const scope = await documentsScopeWhere(access);
  const match = await db.studentDocument.findFirst({
    where: { studentId, ...scope },
    select: { id: true },
  });
  return match !== null;
}

/** Loads a student's document list, scoped to the viewer. */
export async function listStudentDocuments(
  access: SchoolAccess,
  studentId: string
) {
  const scope = await documentsScopeWhere(access);
  return db.studentDocument.findMany({
    where: { studentId, ...scope },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}