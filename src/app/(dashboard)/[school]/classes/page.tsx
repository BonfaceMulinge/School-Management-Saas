import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { School } from "lucide-react";
import { ClassActions, NewClassDialog } from "./actions";

export const metadata: Metadata = {
  title: "Classes",
};

export default async function ClassesPage(props: PageProps<"/[school]/classes">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "classes:view", { next: `/${slug}` }),
    canAccess(slug, "classes:manage"),
  ]);

  const classes = await db.class.findMany({
    where: { schoolId: access.schoolId },
    include: { _count: { select: { streams: true, assignments: true } } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Classes"
        description="Grade levels / classes offered by this school."
        action={canManage ? <NewClassDialog slug={slug} /> : undefined}
      />

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <School className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No classes yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create classes to organise streams and teacher assignments.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => (
            <div key={cls.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{cls.name}</h3>
                {cls.archived ? <Badge variant="outline">Archived</Badge> : null}
              </div>
              <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Streams</dt>
                  <dd>{cls._count.streams}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Assignments</dt>
                  <dd>{cls._count.assignments}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <ClassActions cls={cls} slug={slug} canManage={canManage} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}