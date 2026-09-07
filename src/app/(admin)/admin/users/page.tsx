import type { Metadata } from "next";

import { requireSuperAdmin } from "@/server/platform-auth";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { PlatformUserActions } from "./platform-user-actions";

export const metadata: Metadata = {
  title: "Platform Users",
};

const ROLE_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SUPER_ADMIN: "destructive",
  SUPPORT: "secondary",
  null: "outline",
};

export default async function AdminUsersPage() {
  const access = await requireSuperAdmin({ next: "/admin" });

  const users = await db.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      platformRole: true,
      createdAt: true,
      _count: {
        select: { memberships: true },
      },
    },
    orderBy: [{ platformRole: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform Users"
        description="Assign or change platform roles (Super Admin / Support). School-scoped roles are managed inside each school."
      />

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users"
          description="Users who sign in will appear here so you can grant platform roles."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Platform Role</th>
                <th className="px-4 py-3 text-left font-medium">School Memberships</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        {user.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-medium">{user.name ?? "Unnamed"}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={ROLE_BADGE[user.platformRole ?? "null"] ?? "outline"}>
                      {user.platformRole ?? "None"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">{user._count.memberships}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <PlatformUserActions
                      userId={user.id}
                      currentRole={user.platformRole}
                      isSelf={user.id === access.user.id}
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

// Icons
import { Users } from "lucide-react";