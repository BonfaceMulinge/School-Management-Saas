import type { ComponentType } from "react";
import type { Metadata } from "next";

import { getSchoolCounts, getRecentSchools, getPlatformUserCounts, getTotalStudents } from "@/server/services/admin-schools";
import { getSchoolsWithExpiringSubscriptions } from "@/server/services/admin-schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Platform Dashboard",
};

export default async function AdminDashboardPage() {
  const [schoolCounts, recentSchools, userCounts, totalStudents, expiringSchools] = await Promise.all([
    getSchoolCounts(),
    getRecentSchools(5),
    getPlatformUserCounts(),
    getTotalStudents(),
    getSchoolsWithExpiringSubscriptions(30),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform Dashboard"
        description="Overview of schools, subscriptions, and platform activity."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Schools"
          value={schoolCounts.total.toLocaleString()}
          description={`${schoolCounts.active} active · ${schoolCounts.suspended} suspended · ${schoolCounts.archived} archived`}
          icon={Building2}
        />
        <StatCard
          title="Total Students"
          value={totalStudents.toLocaleString()}
          description="Across all active schools"
          icon={GraduationCap}
        />
        <StatCard
          title="Platform Users"
          value={userCounts.totalUsers.toLocaleString()}
          description={`${userCounts.superAdmins} super admins · ${userCounts.support} support`}
          icon={Users}
        />
        <StatCard
          title="Expiring Soon"
          value={expiringSchools.length.toLocaleString()}
          description="Subscriptions expiring within 30 days"
          icon={AlertCircle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Recently Created Schools</h2>
            <p className="text-xs text-muted-foreground">Latest 5 schools added to the platform</p>
          </div>
          <div className="divide-y divide-border">
            {recentSchools.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No schools yet</div>
            ) : (
              recentSchools.map((school) => (
                <div key={school.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50">
                  <div>
                    <p className="font-medium">{school.name}</p>
                    <p className="text-xs text-muted-foreground">{school.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant={school.status === "ACTIVE" ? "default" : "outline"}>
                      {school.status}
                    </Badge>
                    <span className="text-muted-foreground">{formatDate(school.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Expiring Subscriptions</h2>
            <p className="text-xs text-muted-foreground">Schools with subscriptions expiring within 30 days</p>
          </div>
          <div className="divide-y divide-border">
            {expiringSchools.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">No expiring subscriptions</div>
            ) : (
              expiringSchools.map((school) => {
                const sub = school.subscriptions[0];
                return (
                  <div key={school.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50">
                    <div>
                      <p className="font-medium">{school.name}</p>
                      <p className="text-xs text-muted-foreground">{school.slug}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {sub && (
                        <>
                          <Badge variant="outline">{sub.plan.name}</Badge>
                          <span className="text-muted-foreground">
                            {sub.endDate ? formatDate(sub.endDate) : "No end date"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
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
import {
  Building2,
  GraduationCap,
  Users,
  AlertCircle,
} from "lucide-react";