import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ArrowLeft } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { listStudentDocuments } from "@/server/services/documents";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { documentTypeLabel, formatBytes } from "@/lib/documents";
import { fullName } from "@/lib/students";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { DocumentActions } from "@/components/documents/document-actions";

export const metadata: Metadata = {
  title: "Student documents",
};

export default async function StudentDocumentsPage(
  props: PageProps<"/[school]/students/[studentId]/documents">
) {
  const { school: slug, studentId } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "documents:view", { next: `/${slug}/students/${studentId}` });

  const student = await db.student.findFirst({
    where: { id: studentId, schoolId: access.schoolId, archived: false },
    select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
  });
  if (!student) notFound();

  const documents = await listStudentDocuments(access, studentId);
  const canManage = access.membership?.role === "SCHOOL_ADMIN" || access.isPlatformStaff;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description={`Documents for ${fullName(student.firstName, student.middleName, student.lastName)}`}
        action={
          canManage ? (
            <UploadDialog studentId={studentId} slug={slug} onSuccess={() => window.location.reload()} />
          ) : (
            <Link
              href={`/${slug}/students/${studentId}`}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </Link>
          )
        }
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={canManage ? "Upload the first document for this student." : "No documents have been uploaded for this student."}
          action={canManage ? <UploadDialog studentId={studentId} slug={slug} onSuccess={() => window.location.reload()} /> : null}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Description</th>
                <th className="px-4 py-3 text-left font-medium">Uploaded by</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Size</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                {canManage ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{documentTypeLabel(doc.type)}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium">{doc.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{doc.description ?? "—"}</td>
                  <td className="px-4 py-3">{doc.uploadedBy.name}</td>
                  <td className="px-4 py-3">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3">{formatBytes(doc.sizeBytes)}</td>
                  <td className="px-4 py-3">
                    {doc.storageKey ? (
                      <Badge variant="secondary">Stored</Badge>
                    ) : (
                      <Badge variant="outline">Not persisted</Badge>
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      <DocumentActions doc={{ id: doc.id, title: doc.title, storageKey: doc.storageKey, type: doc.type, sizeBytes: doc.sizeBytes }} slug={slug} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}