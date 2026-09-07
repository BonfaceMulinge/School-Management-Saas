import type { Metadata } from "next";

import { requireSuperAdmin } from "@/server/platform-auth";
import { listAuditLogs } from "@/server/services/audit-log";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Audit Log",
};

const ACTION_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  SCHOOL_CREATE: "default",
  SCHOOL_UPDATE: "secondary",
  SCHOOL_STATUS_CHANGE: "destructive",
  SUBSCRIPTION_CREATE: "default",
  SUBSCRIPTION_UPDATE: "secondary",
  SUBSCRIPTION_STATUS_CHANGE: "destructive",
  PLAN_CREATE: "default",
  PLAN_UPDATE: "secondary",
  USER_ROLE_CHANGE: "destructive",
  USER_PLATFORM_ROLE_CHANGE: "destructive",
  STAFF_CREATE: "default",
  STAFF_UPDATE: "secondary",
  STAFF_ARCHIVE: "destructive",
  SETTINGS_CHANGE: "secondary",
  SCHOOL_ADMIN_PROVISION: "default",
  ONBOARDING_STEP: "secondary",
  FINANCIAL_ACTION: "secondary",
  DATA_EXPORT: "secondary",
  OTHER: "outline",
};

export default async function AdminAuditPage() {
  await requireSuperAdmin({ next: "/admin" });

  const { logs, total } = await listAuditLogs({ page: 1, take: 50 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit Log"
        description="Platform administrative action history."
      />

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Showing {logs.length} of {total} total entries. Most recent first.
          </p>
        </div>

        {logs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No audit entries"
            description="Administrative actions will be logged here."
          />
        ) : (
          <div className="rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Actor</th>
                  <th className="px-4 py-3 text-left font-medium">Entity</th>
                  <th className="px-4 py-3 text-left font-medium">School</th>
                  <th className="px-4 py-3 text-left font-medium">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-xs font-mono">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ACTION_BADGE[log.action] ?? "outline"}>
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.actor.name ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{log.actor.email}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">{log.entity} #{log.entityId}</td>
                    <td className="px-4 py-3">
                      {log.school ? (
                        <div className="text-sm">{log.school.name}</div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Platform</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.metadata ? (
                        <pre className="max-h-16 overflow-auto text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Icons
import { FileText } from "lucide-react";