import type { Metadata } from "next";
import Link from "next/link";

import { requireSuperAdmin } from "@/server/platform-auth";
import { listSchools } from "@/server/services/admin-schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { CreateSchoolDialog } from "./create-school-dialog";
import { StatusAction } from "../schools/[id]/status-action";
import { ArchiveAction } from "../schools/[id]/archive-action";

export const metadata: Metadata = {
  title: "School Management",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  SUSPENDED: "destructive",
  ARCHIVED: "outline",
};

export default async function AdminSchoolsPage() {
  await requireSuperAdmin({ next: "/admin" });

  const schools = await listSchools();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="School Management"
        description="Create, view, and manage schools across the platform."
        action={<CreateSchoolDialog />}
      />

      {schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No schools yet"
          description="Create the first school to get started."
          action={<CreateSchoolDialog />}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">School</th>
                <th className="px-4 py-3 text-left font-medium">Contact</th>
                <th className="px-4 py-3 text-left font-medium">Currency</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Members</th>
                <th className="px-4 py-3 text-left font-medium">Students</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {schools.map((school) => (
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
                    {school.email && <div className="text-xs">{school.email}</div>}
                    {school.phone && <div className="text-xs text-muted-foreground">{school.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{school.currency}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[school.status] ?? "outline"}>
                      {school.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">{school._count.memberships}</td>
                  <td className="px-4 py-3 text-sm">{school._count.students}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(school.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/schools/${school.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View
                      </Link>
                      <StatusAction
                        school={{ id: school.id, name: school.name, status: school.status }}
                      />
                      {school.status !== "ARCHIVED" && (
                        <ArchiveAction school={{ id: school.id, name: school.name, status: school.status }} />
                      )}
                    </div>
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

// Icons
import { Building2 } from "lucide-react";