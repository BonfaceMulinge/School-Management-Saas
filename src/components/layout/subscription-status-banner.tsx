import Link from "next/link";

import { formatDate } from "@/lib/format";
import type { SubscriptionCheckResult } from "@/server/services/subscription-enforcement";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decide (outside the component so render stays pure) whether a subscription
 * needs a warning banner and what it should say.
 */
export function subscriptionBannerMessage(
  subscription: SubscriptionCheckResult["subscription"]
): string | null {
  if (!subscription) return null;

  const now = Date.now();
  const endsAt = subscription.endDate?.getTime();
  const expiringSoon =
    endsAt !== undefined && endsAt > now && endsAt - now < 30 * DAY_MS;

  if (subscription.status !== "GRACE_PERIOD" && !expiringSoon) return null;

  if (subscription.status === "GRACE_PERIOD") {
    return `This school's subscription is in its grace period${
      subscription.gracePeriodEnd
        ? ` and ends ${formatDate(subscription.gracePeriodEnd)}`
        : ""
    }.`;
  }

  return `This school's subscription renews/ends ${
    subscription.endDate ? formatDate(subscription.endDate) : "soon"
  }.`;
}

/**
 * A slim banner shown inside a school shell when its subscription is in the
 * grace period or is expiring soon. Nothing here can change the subscription —
 * it only informs the school admin.
 */
export function SubscriptionStatusBanner({
  slug,
  message,
}: {
  slug: string;
  message: string | null;
}) {
  if (!message) return null;

  return (
    <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        <Link
          href={`/${slug}/settings/subscription`}
          className="font-medium underline underline-offset-2 hover:text-amber-950"
        >
          View subscription
        </Link>
      </div>
    </div>
  );
}