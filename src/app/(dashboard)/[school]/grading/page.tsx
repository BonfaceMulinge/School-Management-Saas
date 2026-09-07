import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ScaleActions, NewScaleDialog } from "./grading-actions";
import type { ScaleRow } from "./grading-actions";

export const metadata: Metadata = {
  title: "Grading",
};

export default async function GradingPage(props: PageProps<"/[school]/grading">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "grading:view", { next: `/${slug}` }),
    canAccess(slug, "grading:manage"),
  ]);

  const scales = await db.gradeScale.findMany({
    where: { schoolId: access.schoolId },
    include: { bands: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const rows: ScaleRow[] = scales.map((scale) => ({
    id: scale.id,
    name: scale.name,
    isDefault: scale.isDefault,
    bands: scale.bands
      .slice()
      .sort((a, b) => a.minPercent.toNumber() - b.minPercent.toNumber())
      .map((b) => ({
        id: b.id,
        minPercent: b.minPercent.toNumber(),
        maxPercent: b.maxPercent.toNumber(),
        grade: b.grade,
        points: b.points === null ? null : b.points.toNumber(),
        remark: b.remark,
      })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Grading"
        description="School grading scales — percentages map to grades, points and remarks."
        action={canManage ? <NewScaleDialog slug={slug} /> : undefined}
      />

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">No grading scales yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a scale so exam percentages become grades and points. The first scale becomes the school default.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map((scale) => (
            <section key={scale.id} className="overflow-hidden rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold">{scale.name}</h2>
                  {scale.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                </div>
                <ScaleActions
                  slug={slug}
                  scale={scale}
                  canManage={canManage}
                  scaleCount={rows.length}
                />
              </div>
              <div className="overflow-x-auto bg-card">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Grade</th>
                      <th className="px-4 py-3 text-left font-medium">Range (%)</th>
                      <th className="px-4 py-3 text-center font-medium">Points</th>
                      <th className="px-4 py-3 text-left font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {scale.bands.map((band) => (
                      <tr key={band.id}>
                        <td className="px-4 py-3 font-semibold">{band.grade}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {band.minPercent} – {band.maxPercent}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {band.points === null ? "—" : band.points}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{band.remark || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}