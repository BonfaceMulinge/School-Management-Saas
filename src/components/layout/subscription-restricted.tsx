import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SubscriptionCheckResult } from "@/server/services/subscription-enforcement";

/**
 * Full-screen explanation shown in place of a school's pages when the school
 * record is active but its subscription is not. School members cannot change
 * subscription status here — that is a platform-administrator action.
 */
export function SubscriptionRestricted({ slug, result }: { slug: string; result: SubscriptionCheckResult }) {
  return (
    <div className="flex min-h-72 items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-lg">Subscription required</CardTitle>
          <CardDescription>
            This school&apos;s pages are temporarily restricted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p role="alert" className="rounded-md bg-amber-50 px-3 py-2.5 text-amber-900">
            {result.reason ?? "The subscription is not active."}
          </p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>Reading the dashboard is disabled until the subscription is active again.</li>
            <li>Your saved data is intact — nothing has been deleted.</li>
            <li>Only a platform administrator can renew, change or activate a subscription.</li>
          </ul>
          <div className="flex gap-2">
            <Link
              href={`/${slug}/settings/subscription`}
              className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              View subscription status
            </Link>
            <a
              href="mailto:support@example.com"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Contact support
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}