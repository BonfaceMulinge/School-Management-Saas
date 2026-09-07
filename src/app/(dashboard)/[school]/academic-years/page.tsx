import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { formatPeriod } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CalendarRange } from "lucide-react";
import { AcademicYearActions } from "./actions";
import { NewAcademicYearDialog } from "./new-year-dialog";

export const metadata: Metadata = {
  title: "Academic Years",
};

export default async function AcademicYearsPage(
  props: PageProps<"/[school]/academic-years">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "academic-years:view", { next: `/${slug}` }),
    canAccess(slug, "academic-years:manage"),
  ]);

  const years = await db.academicYear.findMany({
    where: { schoolId: access.schoolId },
    include: { _count: { select: { terms: true } } },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Academic Years"
        description="School years used to structure terms and enrolment records."
        action={canManage ? <NewAcademicYearDialog slug={slug} /> : undefined}
      />

      {years.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <CalendarRange className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No academic years yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create an academic year to begin structuring terms and enrolment.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Academic Year
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Period
                </th>
                <th scope="col" className="px-4 py-3 text-center font-medium">
                  Terms
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {years.map((year) => (
                <tr key={year.id}>
                  <td className="px-4 py-3 font-medium">{year.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatPeriod(year.startDate, year.endDate)}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {year._count.terms}
                  </td>
                  <td className="px-4 py-3">
                    {year.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : year.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AcademicYearActions
                      year={year}
                      slug={slug}
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