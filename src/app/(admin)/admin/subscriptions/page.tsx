import type { Metadata } from "next";
import Link from "next/link";

import { requireSuperAdmin } from "@/server/platform-auth";
import { listSubscriptions } from "@/server/services/school-subscriptions";
import { setSubscriptionStatusAction, cancelSubscriptionAction } from "@/server/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { CreateSubscriptionDialog } from "./create-subscription-dialog";

export const metadata: Metadata = {
  title: "Subscriptions",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  TRIAL: "secondary",
  GRACE_PERIOD: "secondary",
  EXPIRED: "outline",
  SUSPENDED: "destructive",
  CANCELLED: "destructive",
};

export default async function AdminSubscriptionsPage() {
  await requireSuperAdmin({ next: "/admin" });

  const subscriptions = await listSubscriptions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        description="View and manage school subscriptions."
        action={<CreateSubscriptionDialog onSuccess={() => window.location.reload()} />}
      />

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscriptions yet"
          description="Create a subscription for a school to get started."
          action={<CreateSubscriptionDialog onSuccess={() => window.location.reload()} />}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">School</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Start Date</th>
                <th className="px-4 py-3 text-left font-medium">End Date</th>
                <th className="px-4 py-3 text-left font-medium">Grace Until</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/schools/${sub.school.id}`} className="font-medium text-primary hover:underline">
                      {sub.school.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{sub.school.slug}</div>
                  </td>
                  <td className="px-4 py-3">{sub.plan.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[sub.status] ?? "outline"}>
                      {sub.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">{formatDate(sub.startDate)}</td>
                  <td className="px-4 py-3 text-xs">{sub.endDate ? formatDate(sub.endDate) : "—"}</td>
                  <td className="px-4 py-3 text-xs">{sub.gracePeriodEnd ? formatDate(sub.gracePeriodEnd) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <SubscriptionActions subscription={sub} onSuccess={() => window.location.reload()} />
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

function SubscriptionActions({
  subscription,
  onSuccess,
}: {
  subscription: {
    id: string;
    status: string;
  };
  onSuccess: () => void;
}) {
  const isActive = ["ACTIVE", "TRIAL", "GRACE_PERIOD"].includes(subscription.status);
  const canCancel = !["CANCELLED", "EXPIRED"].includes(subscription.status);

  return (
    <div className="flex items-center justify-end gap-2">
      {isActive && (
        <form action={async () => {
          const res = await setSubscriptionStatusAction(subscription.id, "SUSPENDED");
          if (res.ok) onSuccess();
        }}>
          <button type="submit" className="text-sm text-destructive hover:underline">
            Suspend
          </button>
        </form>
      )}
      {!isActive && subscription.status !== "CANCELLED" && subscription.status !== "EXPIRED" && (
        <form action={async () => {
          const res = await setSubscriptionStatusAction(subscription.id, "ACTIVE");
          if (res.ok) onSuccess();
        }}>
          <button type="submit" className="text-sm text-primary hover:underline">
            Activate
          </button>
        </form>
      )}
      {canCancel && (
        <form action={async () => {
          const res = await cancelSubscriptionAction(subscription.id, { immediate: false, gracePeriodDays: 30 });
          if (res.ok) onSuccess();
        }}>
          <button type="submit" className="text-sm text-destructive hover:underline">
            Cancel (30-day grace)
          </button>
        </form>
      )}
    </div>
  );
}

// Icons
import { CreditCard } from "lucide-react";