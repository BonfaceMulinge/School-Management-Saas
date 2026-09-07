import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { staffScopeWhere } from "@/server/services/staff";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { fullName } from "@/lib/students";
import { STAFF_ROLE_LABELS, STAFF_STATUS_LABELS } from "@/lib/staff";
import { NewStaffDialog } from "@/components/staff/new-staff-dialog";
import { StaffRowActions } from "@/components/staff/staff-row-actions";
import type { StaffDialogData } from "@/components/staff/edit-staff-dialog";
import type { StaffRole, StaffStatus } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Staff",
};

const PAGE_SIZE = 20;

const ROLE_OPTIONS = Object.entries(STAFF_ROLE_LABELS) as [StaffRole, string][];
const STATUS_OPTIONS = Object.entries(STAFF_STATUS_LABELS) as [StaffStatus, string][];

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function StaffPage(
  props: PageProps<"/[school]/staff">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "staff:view", { next: `/${slug}` }),
    canAccess(slug, "staff:manage"),
  ]);

  const scope = await staffScopeWhere(access);
  const q = single(searchParams.q);
  const role = single(searchParams.role);
  const status = single(searchParams.status);
  const showArchived = single(searchParams.archived) === "1";
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const where = {
    ...scope,
    schoolId: access.schoolId,
    ...(showArchived ? {} : { archived: false }),
    ...(role && STAFF_ROLE_LABELS[role as StaffRole]
      ? { role: role as StaffRole }
      : {}),
    ...(status && STAFF_STATUS_LABELS[status as StaffStatus]
      ? { status: status as StaffStatus }
      : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { middleName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { staffNo: { contains: q, mode: "insensitive" as const } },
            { department: { contains: q, mode: "insensitive" as const } },
            { position: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, staff] = await Promise.all([
    db.staff.count({ where }),
    db.staff.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
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
    if (role) params.set("role", role);
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
        title="Staff"
        description="All staff employment records for this school."
        action={canManage ? <NewStaffDialog slug={slug} /> : undefined}
      />

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, staff number, department…"
            className="h-9 w-full rounded-md border border-border bg-background pr-44 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
          <div className="absolute top-1 right-2 flex gap-1">
            <select
              name="role"
              defaultValue={role ?? ""}
              className="h-7 rounded border border-border bg-background px-1 text-xs focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="">All roles</option>
              {ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status ?? ""}
              className="h-7 rounded border border-border bg-background px-1 text-xs focus-visible:border-ring focus-visible:outline-none"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
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
          href={queryString({ q: "", role: "", status: "", archived: "" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </form>

      {total === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <h3 className="text-sm font-medium">
            {q || role || status || showArchived ? "No staff match your filters" : "No staff yet"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q || role || status || showArchived
              ? "Try adjusting the search or resetting the filters."
              : canManage
                ? "Add your first staff member to begin building the staff register."
                : "Staff records managed by the school administration will appear here."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Staff member</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Staff No.</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {staff.map((member) => (
                  <tr key={member.id} className={member.archived ? "opacity-60" : undefined}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {member.firstName[0]}
                          {member.lastName[0]}
                        </span>
                        <div>
                          <p className="font-medium">
                            {fullName(member.firstName, member.middleName, member.lastName)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.position
                              ? member.position
                              : "No position set"}
                            {member.user ? ` · ${member.user.email}` : " · no account"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.staffNo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {STAFF_ROLE_LABELS[member.role]}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.department ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {member.archived ? (
                        <Badge variant="outline">Archived</Badge>
                      ) : member.status === "ACTIVE" ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StaffRowActions
                        slug={slug}
                        staff={
                          {
                            id: member.id,
                            firstName: member.firstName,
                            middleName: member.middleName,
                            lastName: member.lastName,
                            staffNo: member.staffNo,
                            role: member.role,
                            phone: member.phone,
                            dateJoined: member.dateJoined
                              ? member.dateJoined.toISOString().slice(0, 10)
                              : "",
                            department: member.department,
                            position: member.position,
                            status: member.status,
                            archived: member.archived,
                            userId: member.user?.id ?? null,
                            userEmail: member.user?.email ?? null,
                          } as StaffDialogData
                        }
                        canManage={canManage}
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
              {Math.min(safePage * PAGE_SIZE, total)} of {total} staff
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