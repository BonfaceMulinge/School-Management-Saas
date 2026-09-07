import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { getSubscriptionBySchoolId } from "@/server/services/school-subscriptions";
import { checkSchoolSubscriptionAccess } from "@/server/services/subscription-enforcement";
import { requirePermission } from "@/server/authorization";
import { formatMoney } from "@/lib/format";

import { SubscriptionStatusCard } from "./subscription-status-card";

export default async function SubscriptionSettingsPage(
  props: PageProps<"/[school]/settings/subscription">
) {
  const { school: slug } = await props.params;

  await requirePermission(slug, "settings:view", { next: `/${slug}` });

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [result, subscription] = await Promise.all([
    checkSchoolSubscriptionAccess(slug),
    getSubscriptionBySchoolId(school.id),
  ]);

  const price = subscription
    ? formatMoney(subscription.plan.annualPrice, school.currency)
    : "—";

  return (
    <SubscriptionStatusCard
      schoolName={school.name}
      price={price}
      result={result}
    />
  );
}