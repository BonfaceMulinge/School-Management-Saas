import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { formatPeriod } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CalendarClock } from "lucide-react";
import { TermActions } from "./actions";
import { NewTermDialog } from "./new-term-dialog";

export const metadata: Metadata = {
  title: "Terms",
};

export default async function TermsPage(props: PageProps<"/[school]/terms">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "terms:view", { next: `/${slug}` }),
    canAccess(slug, "terms:manage"),
  ]);

  const [years, terms] = await Promise.all([
    db.academicYear.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: { id: true, name: true },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    }),
    db.term.findMany({
      where: { academicYear: { schoolId: access.schoolId } },
      include: { academicYear: { select: { name: true } }, _count: { select: { enrollments: true } } },
      orderBy: [{ academicYear: { startDate: "desc" } }, { startDate: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Terms"
        description="Terms within academic years. Terms may not overlap inside a year."
        action={canManage ? <NewTermDialog slug={slug} years={years} /> : undefined}
      />

      {terms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <CalendarClock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No terms yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create terms inside an academic year to structure the school calendar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">Term</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Academic Year</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Period</th>
                <th scope="col" className="px-4 py-3 text-center font-medium">Enrolments</th>
                <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {terms.map((term) => (
                <tr key={term.id}>
                  <td className="px-4 py-3 font-medium">{term.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{term.academicYear.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatPeriod(term.startDate, term.endDate)}
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {term._count.enrollments}
                  </td>
                  <td className="px-4 py-3">
                    {term.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : term.archived ? (
                      <Badge variant="outline">Archived</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <TermActions term={term} slug={slug} years={years} canManage={canManage} />
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