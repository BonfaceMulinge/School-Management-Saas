import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { UserCheck } from "lucide-react";
import { AssignmentRowActions } from "./actions";
import { NewAssignmentDialog } from "./new-assignment-dialog";

export const metadata: Metadata = {
  title: "Teacher Assignments",
};

export default async function AssignmentsPage(props: PageProps<"/[school]/assignments">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "assignments:view", { next: `/${slug}` }),
    canAccess(slug, "assignments:manage"),
  ]);

  const [teachers, classes, subjects, streams, assignments] = await Promise.all([
    db.membership.findMany({
      where: { schoolId: access.schoolId, role: "TEACHER" },
      select: {
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: { schoolId: access.schoolId },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    db.stream.findMany({
      where: { class: { schoolId: access.schoolId } },
      select: { id: true, name: true, class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
    }),
    db.teacherAssignment.findMany({
      where: { schoolId: access.schoolId },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        class: { select: { id: true, name: true } },
        stream: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teacher Assignments"
        description="Assign teachers to subjects, classes and streams."
        action={
          canManage ? (
            <NewAssignmentDialog
              slug={slug}
              teachers={teachers}
              classes={classes}
              subjects={subjects}
              streams={streams}
            />
          ) : undefined
        }
      />

      {assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <UserCheck className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No assignments yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign a teacher to teach a subject for a class or stream.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Teacher</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Class</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Stream</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Subject</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{assignment.teacher.name ?? assignment.teacher.email}</div>
                    <div className="text-xs text-muted-foreground">{assignment.teacher.email}</div>
                  </td>
                  <td className="px-4 py-3">{assignment.class.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {assignment.stream?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {assignment.subject.code}
                    </code>{" "}
                    <span className="text-muted-foreground">· {assignment.subject.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AssignmentRowActions
                      assignment={assignment}
                      slug={slug}
                      teachers={teachers}
                      classes={classes}
                      subjects={subjects}
                      streams={streams}
                      canManage={canManage}
                    />
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