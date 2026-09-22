import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { requireSuperAdmin } from "@/server/platform-auth";
import { getSchoolCounts, listSchoolsPage } from "@/server/services/admin-schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { CreateSchoolDialog } from "./schools/create-school-dialog";
import { StatusAction } from "./schools/[id]/status-action";
import type { SchoolStatus } from "@/generated/prisma/client";

export const metadata: Metadata = {
  title: "Super Admin Dashboard",
};

const PAGE_SIZE = 20;

const STATUS_META: Record<
  string,
  { label: string; badge: "default" | "secondary" | "destructive" | "outline" }
> = {
  ACTIVE: { label: "Active", badge: "default" },
  SUSPENDED: { label: "Suspended", badge: "destructive" },
  ARCHIVED: { label: "Archived", badge: "outline" },
};

const STATUS_OPTIONS: Array<{ value: SchoolStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
];

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AdminDashboardPage(
  props: PageProps<"/admin">
) {
  await requireSuperAdmin({ next: "/admin" });

  const searchParams = await props.searchParams;
  const q = single(searchParams.q);
  const status = single(searchParams.status);
  const page = Math.max(1, Number(single(searchParams.page)) || 1);

  const [schoolCounts, result] = await Promise.all([
    getSchoolCounts(),
    listSchoolsPage({
      search: q,
      status: (status ?? "ALL") as SchoolStatus | "ALL",
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);

  const { items: schools, total } = result;
  const totalPages = result.totalPages;
  const safePage = Math.min(page, totalPages);
  const hasFilters = Boolean(q || status);

  const queryString = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
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
        title="Super Admin Dashboard"
        description="Schools registered on the platform."
        action={<CreateSchoolDialog />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Schools"
          value={schoolCounts.total.toLocaleString()}
          description="Total number of registered schools"
          icon={Building2}
        />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by school name, administrator, or admin email…"
            className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          />
        </div>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:outline-none"
        >
          {STATUS_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value === "ALL" ? "" : value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Search
        </button>
        <a
          href={queryString({ q: "", status: "" })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Reset
        </a>
      </form>

      {total === 0 ? (
        <EmptyState
          icon={Building2}
          title={hasFilters ? "No schools match your filters" : "No schools registered yet."}
          description={
            hasFilters
              ? "Try adjusting the search or resetting the filters."
              : "Create the first school to get started."
          }
          action={<CreateSchoolDialog />}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">School</th>
                  <th className="px-4 py-3 text-left font-medium">Administrator</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {schools.map((school) => {
                  const meta = STATUS_META[school.status] ?? { label: school.status, badge: "outline" as const };
                  return (
                    <tr key={school.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/schools/${school.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {school.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{school.slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        {school.administrator ? (
                          <>
                            <div className="text-sm">{school.administrator.name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{school.administrator.email}</div>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={meta.badge}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(school.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/schools/${school.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            View
                          </Link>
                          {(school.status === "ACTIVE" || school.status === "SUSPENDED") && (
                            <StatusAction
                              school={{ id: school.id, name: school.name, status: school.status }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, total)} of {total} schools
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

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-semibold">{value}</p>
        </div>
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// Icons
import { Building2 } from "lucide-react";