import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { requireSchoolAccess } from "@/server/authorization";
import { checkSchoolSubscriptionAccess } from "@/server/services/subscription-enforcement";
import { getOnboardingForSchool } from "@/server/services/onboarding";
import { unreadNotificationCount } from "@/server/services/communication";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SubscriptionStatusBanner, subscriptionBannerMessage } from "@/components/layout/subscription-status-banner";
import { SubscriptionRestricted } from "@/components/layout/subscription-restricted";
import { OnboardingRedirect } from "@/components/layout/onboarding-redirect";

export const metadata: Metadata = {
  title: "Dashboard",
};

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function SchoolLayout(props: LayoutProps<"/[school]">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requireSchoolAccess(slug, { next: `/${slug}` });

  // Platform staff (SUPER_ADMIN / SUPPORT) bypass school gating so they can
  // triage. School-scoped users are blocked when the school is suspended or
  // archived (kept as not-found), but an ACTIVE school with an inactive
  // subscription gets a clear explanation instead.
  let subCheck: Awaited<ReturnType<typeof checkSchoolSubscriptionAccess>> | null = null;
  let onboarding: { currentStep: number; completed: boolean; completedAt: Date | null } | null = null;

  if (!access.isPlatformStaff) {
    if (school.status !== "ACTIVE") notFound();

    subCheck = await checkSchoolSubscriptionAccess(slug);
    onboarding = await getOnboardingForSchool(access.schoolId);
  }

  const roleLabel =
    access.membership?.role ?? access.user.platformRole ?? undefined;

  const notificationsUnread = access.membership
    ? await unreadNotificationCount(access.schoolId, access.user.id)
    : undefined;

  const onboardingEnabled =
    access.membership?.role === "SCHOOL_ADMIN" &&
    onboarding !== null &&
    !onboarding.completed;

  return (
    <DashboardShell
      school={school.slug}
      user={access.user}
      roleLabel={roleLabel ? formatRole(roleLabel) : undefined}
      notificationsUnread={notificationsUnread}
    >
      {subCheck ? (
        <>
          <SubscriptionStatusBanner
            slug={slug}
            message={subscriptionBannerMessage(subCheck.subscription ?? null)}
          />
          {!subCheck.allowed ? (
            <SubscriptionRestricted slug={slug} result={subCheck} />
          ) : (
            props.children
          )}
        </>
      ) : (
        props.children
      )}
      <OnboardingRedirect
        slug={slug}
        enabled={onboardingEnabled}
        completed={onboarding?.completed ?? true}
      />
    </DashboardShell>
  );
}