import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";
import { StreamActions, NewStreamDialog } from "./actions";

export const metadata: Metadata = {
  title: "Streams",
};

export default async function StreamsPage(props: PageProps<"/[school]/streams">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "streams:view", { next: `/${slug}` }),
    canAccess(slug, "streams:manage"),
  ]);

  const [classes, streams] = await Promise.all([
    db.class.findMany({
      where: { schoolId: access.schoolId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.stream.findMany({
      where: { class: { schoolId: access.schoolId } },
      include: { class: { select: { name: true } }, _count: { select: { assignments: true } } },
      orderBy: [{ class: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Streams"
        description="Sub-divisions of a class (e.g. East / West)."
        action={canManage ? <NewStreamDialog slug={slug} classes={classes} /> : undefined}
      />

      {streams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Layers className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No streams yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create streams inside a class to split groups of students.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Stream</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Class</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Assignments</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {streams.map((stream) => (
                <tr key={stream.id}>
                  <td className="px-4 py-3 font-medium">{stream.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{stream.class.name}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {stream._count.assignments}
                  </td>
                  <td className="px-4 py-3">
                    {stream.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StreamActions stream={stream} slug={slug} classes={classes} canManage={canManage} />
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