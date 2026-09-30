import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { NewPathwayDialog, PathwayActions, type Pathway } from "./actions";

export const metadata: Metadata = {
  title: "Pathways",
};

export default async function PathwaysPage(props: PageProps<"/[school]/pathways">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "pathways:view", { next: `/${slug}` }),
    canAccess(slug, "pathways:manage"),
  ]);

  const [pathways, activeYear] = await Promise.all([
    db.seniorSchoolPathway.findMany({
      where: { schoolId: access.schoolId },
      include: {
        _count: { select: { enrollments: true, combinations: true } },
      },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    db.academicYear.findFirst({
      where: { schoolId: access.schoolId, archived: false },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: { id: true, name: true },
    }),
  ]);

  const rows: Pathway[] = pathways.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    archived: p.archived,
    studentCount: p._count.enrollments,
    combinationCount: p._count.combinations,
  }));

  const studentsByPathway = activeYear
    ? await db.enrollment.groupBy({
        by: ["pathwayId"],
        where: {
          schoolId: access.schoolId,
          academicYearId: activeYear.id,
          status: "ACTIVE",
          pathwayId: { not: null },
        },
        _count: { _all: true },
      })
    : [];

  const countFor = (id: string) =>
    studentsByPathway.find((row) => row.pathwayId === id)?._count._all ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Senior School Pathways"
        description="Learning areas offered to Grade 10–12 students under the Competency Based Curriculum. Pathways are defined by your school."
        action={canManage ? <NewPathwayDialog slug={slug} /> : undefined}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Compass className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No pathways defined yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Add the pathways your Senior School offers (e.g. STEM, Arts & Sports Science, Social Sciences)."
              : "Pathways created by the school administration will appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Pathway</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Code</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Description</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">
                  Students{activeYear ? ` (${activeYear.name})` : ""}
                </th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Combinations</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((pathway) => (
                <tr key={pathway.id}>
                  <td className="px-4 py-3 font-medium">{pathway.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{pathway.code}</td>
                  <td className="max-w-md px-4 py-3 text-muted-foreground">
                    {pathway.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {countFor(pathway.id)}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {pathway.combinationCount}
                  </td>
                  <td className="px-4 py-3">
                    {pathway.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PathwayActions pathway={pathway} slug={slug} canManage={canManage} />
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