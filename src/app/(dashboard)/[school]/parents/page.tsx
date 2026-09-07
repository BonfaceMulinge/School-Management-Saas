import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { PageHeader } from "@/components/ui/page-header";
import { NewParentDialog } from "@/components/students/guardians";
import { ParentRowActions } from "./actions";
import type { GuardianStudentRef } from "@/components/students/guardians";

export const metadata: Metadata = {
  title: "Parents",
};

const PAGE_SIZE = 20;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function ParentsPage(props: PageProps<"/[school]/parents">) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "parents:view", { next: `/${slug}` }),
    canAccess(slug, "parents:manage"),
  ]);

  const q = single(searchParams.q);
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const where = {
    memberships: { some: { schoolId: access.schoolId, role: "PARENT" as const } },
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, parents] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        guardianships: {
          where: { schoolId: access.schoolId },
          orderBy: { createdAt: "asc" },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                middleName: true,
                lastName: true,
                studentNo: true,
                status: true,
                archived: true,
              },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const [students] = await Promise.all([
    db.student.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentNo: true,
      },
      orderBy: { lastName: "asc" },
      take: 500,
    }),
  ]);

  const refStudents: GuardianStudentRef[] = students;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Parents"
        description="Parent accounts and their linked children at this school."
        action={canManage ? <NewParentDialog slug={slug} /> : undefined}
      />

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or email…"
            className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Search
        </button>
        <a
          href={queryString({ q: "" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </form>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">
            {q ? "No parents match your search" : "No parents yet"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Try a different name or email."
              : "Create a parent account to link them to students."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Parent</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Children</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {parents.map((parent) => (
                  <tr key={parent.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {(parent.name ?? parent.email)[0]?.toUpperCase() ?? "?"}
                        </span>
                        <div>
                          <p className="font-medium">{parent.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{parent.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {parent.guardianships.length === 0 ? (
                        <span className="text-muted-foreground">No children linked</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {parent.guardianships.map((g) => (
                            <li key={g.id} className="text-sm">
                              <span
                                className={g.student.archived ? "opacity-60" : undefined}
                              >
                                {g.student.firstName} {g.student.lastName}
                                {g.student.studentNo ? ` (${g.student.studentNo})` : ""}
                              </span>
                              {g.isPrimary ? (
                                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  primary
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ParentRowActions
                        slug={slug}
                        canManage={canManage}
                        parentId={parent.id}
                        students={refStudents}
                        childrenLinks={parent.guardianships.map((g) => ({
                          id: g.id,
                          studentId: g.student.id,
                          relationship: g.relationship,
                          isPrimary: g.isPrimary,
                          studentName: `${g.student.firstName} ${g.student.lastName}`,
                        }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, total)} of {total} parents
            </p>
            <div className="flex items-center gap-2">
              <a
                href={queryString({ page: String(safePage - 1) })}
                aria-disabled={safePage <= 1}
                className={safePage <= 1
                  ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50"
                  : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Previous
              </a>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <a
                href={queryString({ page: String(safePage + 1) })}
                aria-disabled={safePage >= totalPages}
                className={safePage >= totalPages
                  ? "pointer-events-none rounded-md border border-border px-3 py-1.5 opacity-50"
                  : "rounded-md border border-border px-3 py-1.5 hover:bg-muted"}
              >
                Next
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}