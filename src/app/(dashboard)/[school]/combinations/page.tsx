import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Boxes } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  CombinationActions,
  NewCombinationDialog,
  type Combination,
  type PathwayOption,
  type SubjectOption,
} from "./actions";

export const metadata: Metadata = {
  title: "Subject Combinations",
};

export default async function CombinationsPage(
  props: PageProps<"/[school]/combinations">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "combinations:view", { next: `/${slug}` }),
    canAccess(slug, "combinations:manage"),
  ]);

  const [combinations, pathways, subjects] = await Promise.all([
    db.subjectCombination.findMany({
      where: { schoolId: access.schoolId },
      include: {
        seniorSchoolPathway: { select: { id: true, name: true } },
        subjects: {
          orderBy: { sortOrder: "asc" },
          include: { subject: { select: { name: true } } },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    db.seniorSchoolPathway.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows: Combination[] = combinations.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    description: c.description,
    archived: c.archived,
    pathwayId: c.seniorSchoolPathwayId,
    studentCount: c._count.enrollments,
    subjects: c.subjects.map((s) => ({ subjectId: s.subjectId, name: s.subject.name })),
  }));

  const pathwayOptions: PathwayOption[] = pathways.map((p) => ({ id: p.id, name: p.name }));
  const subjectOptions: SubjectOption[] = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subject Combinations"
        description="The subject sets students take within each Senior School pathway. Combinations drive which subjects students are examined in."
        action={
          canManage ? (
            <NewCombinationDialog
              slug={slug}
              pathways={pathwayOptions}
              subjects={subjectOptions}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Boxes className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No combinations yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Create the subject combinations your Senior School offers, then assign them to students at admission."
              : "Combinations created by the school administration will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((combination) => (
            <div key={combination.id} className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{combination.name}</h2>
                    <Badge variant="outline">{combination.code}</Badge>
                    {combination.pathwayId ? (
                      <Badge variant="secondary">
                        {pathwayOptions.find((p) => p.id === combination.pathwayId)?.name ??
                          "Pathway"}
                      </Badge>
                    ) : null}
                    {combination.archived ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                  {combination.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">{combination.description}</p>
                  ) : null}
                </div>
                <CombinationActions
                  combination={combination}
                  slug={slug}
                  pathways={pathwayOptions}
                  subjects={subjectOptions}
                  canManage={canManage}
                />
              </div>
              <div className="px-4 py-3">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">
                  Subjects ({combination.subjects.length}) · assigned to {combination.studentCount}{" "}
                  student enrollment{combination.studentCount === 1 ? "" : "s"}
                </p>
                {combination.subjects.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No subjects selected.</p>
                ) : (
                  <ol className="mt-2 flex flex-wrap gap-2">
                    {combination.subjects.map((s, index) => (
                      <li
                        key={s.subjectId}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                      >
                        <span className="text-muted-foreground">{index + 1}.</span>
                        {s.name}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}