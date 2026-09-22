import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireSuperAdmin } from "@/server/platform-auth";
import { getSchoolById } from "@/server/services/admin-schools";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "School Details",
};

const STATUS_META: Record<
  string,
  { label: string; badge: "default" | "secondary" | "destructive" | "outline" }
> = {
  ACTIVE: { label: "Active", badge: "default" },
  SUSPENDED: { label: "Suspended", badge: "destructive" },
  ARCHIVED: { label: "Archived", badge: "outline" },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminSchoolViewPage({ params }: Props) {
  await requireSuperAdmin({ next: "/admin" });
  const { id } = await params;

  const school = await getSchoolById(id);
  if (!school) notFound();

  const administrator =
    school.memberships.find((m) => m.role === "SCHOOL_ADMIN")?.user ?? null;
  const meta = STATUS_META[school.status] ?? { label: school.status, badge: "outline" as const };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/admin">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <PageHeader
        title={school.name}
        description={school.slug}
        action={<Badge variant={meta.badge}>{meta.label}</Badge>}
      />

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">School details</h2>
        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-0.5 text-sm">
              <Badge variant={meta.badge}>{meta.label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Administrator</dt>
            <dd className="mt-0.5 text-sm">{administrator?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Admin email</dt>
            <dd className="mt-0.5 text-sm">{administrator?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Created on</dt>
            <dd className="mt-0.5 text-sm">{formatDate(school.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Slug</dt>
            <dd className="mt-0.5 font-mono text-sm">{school.slug}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}