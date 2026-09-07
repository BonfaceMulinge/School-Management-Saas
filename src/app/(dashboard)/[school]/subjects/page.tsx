import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { SubjectActions, NewSubjectDialog } from "./actions";

export const metadata: Metadata = {
  title: "Subjects",
};

export default async function SubjectsPage(props: PageProps<"/[school]/subjects">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "subjects:view", { next: `/${slug}` }),
    canAccess(slug, "subjects:manage"),
  ]);

  const subjects = await db.subject.findMany({
    where: { schoolId: access.schoolId },
    include: { _count: { select: { assignments: true } } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subjects"
        description="Subjects taught by this school."
        action={canManage ? <NewSubjectDialog slug={slug} /> : undefined}
      />

      {subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No subjects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create subjects so teachers can be assigned to teach them.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Subject</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Code</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Assignments</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {subjects.map((subject) => (
                <tr key={subject.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{subject.name}</div>
                    {subject.description ? (
                      <div className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground">
                        {subject.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{subject.code}</code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{subject.department ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {subject._count.assignments}
                  </td>
                  <td className="px-4 py-3">
                    {subject.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SubjectActions subject={subject} slug={slug} canManage={canManage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}