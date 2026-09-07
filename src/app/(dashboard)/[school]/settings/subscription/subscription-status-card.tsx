import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { SubscriptionCheckResult } from "@/server/services/subscription-enforcement";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  TRIAL: { label: "Trial", className: "bg-blue-100 text-blue-800" },
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  GRACE_PERIOD: { label: "Grace period", className: "bg-amber-100 text-amber-800" },
  EXPIRED: { label: "Expired", className: "bg-red-100 text-red-800" },
  SUSPENDED: { label: "Suspended", className: "bg-red-100 text-red-800" },
  CANCELLED: { label: "Cancelled", className: "bg-zinc-100 text-zinc-700" },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export function SubscriptionStatusCard({
  schoolName,
  price,
  result,
}: {
  schoolName: string;
  price: string;
  result: SubscriptionCheckResult;
}) {
  const sub = result.subscription ?? null;
  const badge = sub ? (STATUS_BADGE[sub.status] ?? null) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan &amp; subscription</CardTitle>
        <CardDescription>
          The subscription behind {schoolName}&apos;s account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sub ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">{sub.planName}</p>
                <p className="text-xs text-muted-foreground">{price}/year</p>
              </div>
              {badge ? <Badge className={badge.className}>{badge.label}</Badge> : null}
            </div>

            <dl className="divide-y divide-border">
              <Row
                label="Student limit"
                value={sub.studentLimit === null ? "Unlimited" : `${sub.studentLimit} students`}
              />
              <Row
                label="Staff limit"
                value={sub.staffLimit === null ? "Unlimited" : `${sub.staffLimit} staff`}
              />
              <Row
                label="Renews / ends"
                value={sub.endDate ? formatDate(sub.endDate) : "—"}
              />
              {sub.gracePeriodEnd ? (
                <Row label="Grace period ends" value={formatDate(sub.gracePeriodEnd)} />
              ) : null}
            </dl>

            {!result.allowed ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {result.reason ?? "Access is restricted for this school."}
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Subscription and billing changes are handled by platform administrators.
              Contact them to renew, upgrade or adjust this plan.
            </p>
          </>
        ) : (
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            This school does not have a subscription yet. Contact a platform
            administrator to set one up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}