import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireSuperAdmin } from "@/server/platform-auth";
import { getSchoolById } from "@/server/services/admin-schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { EditSchoolDialog } from "./edit-school-dialog";
import { StatusAction } from "./status-action";
import { ArchiveAction } from "./archive-action";
import { ProvisionAdminDialog } from "./provision-admin-dialog";

export const metadata: Metadata = {
  title: "School Details",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSchoolDetailPage({ params }: Props) {
  await requireSuperAdmin({ next: "/admin/schools" });
  const { id } = await params;

  const school = await getSchoolById(id);
  if (!school) notFound();

  const statusBadge: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    ACTIVE: "default",
    SUSPENDED: "destructive",
    ARCHIVED: "outline",
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={school.name}
        description={school.slug}
        action={
          <>
            <EditSchoolDialog school={school} />
            <StatusAction school={school} />
            {school.status !== "ARCHIVED" && <ArchiveAction school={school} />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Overview</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Slug</dt>
                <dd className="font-mono text-sm">{school.slug}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant={statusBadge[school.status] ?? "outline"}>
                    {school.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Currency</dt>
                <dd className="font-mono text-sm">{school.currency}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Timezone</dt>
                <dd className="font-mono text-sm">{school.timezone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="text-sm">{school.email ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="text-sm">{school.phone ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="text-sm">{school.address ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Motto</dt>
                <dd className="text-sm">{school.motto ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Website</dt>
                <dd className="text-sm">{school.website ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="text-sm">{formatDate(school.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Updated</dt>
                <dd className="text-sm">{formatDate(school.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          {school.subscriptions.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-4">Subscription</h3>
              <div className="space-y-3">
                {school.subscriptions.map((sub) => (
                  <div key={sub.id} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{sub.plan.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.status} · {sub.endDate ? `Ends ${formatDate(sub.endDate)}` : "No end date"}
                          {sub.gracePeriodEnd && ` · Grace until ${formatDate(sub.gracePeriodEnd)}`}
                        </p>
                      </div>
                      <Badge variant={
                        sub.status === "ACTIVE" || sub.status === "TRIAL" ? "default" :
                        sub.status === "GRACE_PERIOD" ? "secondary" : "destructive"
                      }>
                        {sub.status}
                      </Badge>
                    </div>
                    {sub.notes && <p className="text-sm text-muted-foreground">{sub.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Administrators</h3>
              {school.status !== "ARCHIVED" ? (
                <ProvisionAdminDialog
                  schoolId={school.id}
                  schoolName={school.name}
                />
              ) : null}
            </div>
            {school.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No administrators assigned</p>
            ) : (
              <div className="space-y-2">
                {school.memberships.map((m) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {m.user.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-medium">{m.user.name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{m.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">Statistics</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Members</dt>
                <dd className="font-medium">{school._count.memberships}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Students</dt>
                <dd className="font-medium">{school._count.students}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Subscriptions</dt>
                <dd className="font-medium">{school._count.subscriptions}</dd>
              </div>
            </dl>
          </div>

          {school.status !== "ARCHIVED" && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold mb-3">Actions</h3>
              <div className="space-y-2">
                <StatusAction school={school} />
                <ArchiveAction school={school} />
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}