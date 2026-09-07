import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { staffScopeWhere } from "@/server/services/staff";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { fullName } from "@/lib/students";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Teachers",
};

export default async function TeachersPage(
  props: PageProps<"/[school]/teachers">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "staff:view", { next: `/${slug}` });

  const scope = await staffScopeWhere(access);

  const teachers = await db.staff.findMany({
    where: { schoolId: access.schoolId, role: "TEACHER", ...scope },
    include: {
      user: { select: { id: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const counts = await db.teacherAssignment.groupBy({
    by: ["teacherId"],
    where: { schoolId: access.schoolId, teacherId: { in: teachers.map((t) => t.user?.id).filter((id): id is string => Boolean(id)) } },
    _count: { _all: true },
  });
  const countByTeacher = new Map(counts.map((c) => [c.teacherId, c._count._all]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teachers"
        description="Teaching staff with their current subject, class and stream assignments."
      />

      {teachers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No teachers yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add staff with the Teacher role from the Staff page to list them here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Teacher</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Staff No.</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Joined</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Assignments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <a
                      href={`/${slug}/staff/${t.id}`}
                      className="flex items-center gap-3 rounded-md hover:opacity-80"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {t.firstName[0]}
                        {t.lastName[0]}
                      </span>
                      <span className="font-medium">
                        {fullName(t.firstName, t.middleName, t.lastName)}
                      </span>
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.staffNo ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.department ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.dateJoined ? formatDate(t.dateJoined) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant="secondary">
                      {t.user ? countByTeacher.get(t.user.id) ?? 0 : 0} assignment(s)
                    </Badge>
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