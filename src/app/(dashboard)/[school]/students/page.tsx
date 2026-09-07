import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { studentsScopeWhere } from "@/server/services/students";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { currentEnrollment, fullName, type EnrollmentForDisplay } from "@/lib/students";
import { formatDate } from "@/lib/format";
import { NewStudentDialog } from "@/components/students/new-student-dialog";
import { StudentRowActions } from "./row-actions";
import type { StudentDialogData } from "@/components/students/edit-student-dialog";
import type { StudentStatus } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Students",
};

const PAGE_SIZE = 20;
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  WITHDRAWN: "Withdrawn",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function StudentsPage(
  props: PageProps<"/[school]/students">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "students:view", { next: `/${slug}` }),
    canAccess(slug, "students:manage"),
  ]);

  const scope = await studentsScopeWhere(access);
  const q = single(searchParams.q);
  const status = single(searchParams.status);
  const showArchived = single(searchParams.archived) === "1";
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const where = {
    ...scope,
    schoolId: access.schoolId,
    ...(showArchived ? {} : { archived: false }),
    ...(status && STATUS_LABELS[status] ? { status: status as StudentStatus } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { middleName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { studentNo: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, students] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      include: {
        enrollments: {
          where: { schoolId: access.schoolId },
          orderBy: { createdAt: "desc" },
          include: {
            class: { select: { name: true } },
            stream: { select: { name: true } },
            academicYear: { select: { name: true, startDate: true } },
            term: { select: { name: true } },
          },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (showArchived) params.set("archived", "1");
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
        title="Students"
        description="All registered student profiles for this school."
        action={canManage ? <NewStudentDialog slug={slug} /> : undefined}
      />

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or admission number…"
            className="h-9 w-full rounded-md border border-border bg-background pr-16 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
          <div className="absolute top-1 right-2 flex gap-1">
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-7 rounded border border-border bg-background px-1 text-xs focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
          Include archived
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Search
        </button>
        <a
          href={queryString({ q: "", status: "", archived: "" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </form>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">
            {q || status || showArchived ? "No students match your filters" : "No students yet"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || status || showArchived
              ? "Try adjusting the search or resetting the filters."
              : canManage
                ? "Register your first student to begin building the register."
                : "Students registered by the school administration will appear here."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Admission No.</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Gender</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Current placement</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {students.map((student) => {
                  const placement = currentEnrollment(
                    student.enrollments as unknown as EnrollmentForDisplay[]
                  );
                  return (
                    <tr key={student.id} className={student.archived ? "opacity-60" : undefined}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {student.firstName[0]}
                            {student.lastName[0]}
                          </span>
                          <div>
                            <p className="font-medium">
                              {fullName(student.firstName, student.middleName, student.lastName)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              DOB:{" "}
                              {student.dateOfBirth
                                ? formatDate(student.dateOfBirth)
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {student.studentNo ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {student.gender ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {placement ? (
                          <span>
                            {placement.class?.name ?? "—"}
                            {placement.stream ? ` · ${placement.stream.name}` : ""}
                            {placement.academicYear ? (
                              <span className="ml-1 text-xs">({placement.academicYear.name})</span>
                            ) : null}
                          </span>
                        ) : (
                          "Not enrolled"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {student.archived ? (
                          <Badge variant="outline">Archived</Badge>
                        ) : student.status === "ACTIVE" ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">{STATUS_LABELS[student.status]}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StudentRowActions
                          slug={slug}
                          student={
                            {
                              id: student.id,
                              firstName: student.firstName,
                              middleName: student.middleName,
                              lastName: student.lastName,
                              gender: student.gender ?? "",
                              dateOfBirth: student.dateOfBirth
                                ? student.dateOfBirth.toISOString().slice(0, 10)
                                : "",
                              studentNo: student.studentNo,
                              admissionDate: student.admissionDate
                                ? student.admissionDate.toISOString().slice(0, 10)
                                : "",
                              status: student.status,
                              photoUrl: student.photoUrl,
                              address: student.address,
                              phone: student.phone,
                              emergencyContactName: student.emergencyContactName,
                              emergencyContactPhone: student.emergencyContactPhone,
                              emergencyContactRelation: student.emergencyContactRelation,
                              previousSchool: student.previousSchool,
                              house: student.house,
                              archived: student.archived,
                            } as StudentDialogData
                          }
                          canManage={canManage}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, total)} of {total} students
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