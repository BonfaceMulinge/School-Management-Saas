"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Client-side onboarding gate for School Admins. When the school's setup has
 * not been completed, redirects to the onboarding flow from everywhere inside
 * the school (except the onboarding pages themselves). Enabled server-side only
 * for users who may complete onboarding, so other roles are never bounced.
 */
export function OnboardingRedirect({
  slug,
  enabled,
  completed,
}: {
  slug: string;
  enabled: boolean;
  completed: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled || completed) return;
    const onboardingPrefix = `/${slug}/onboarding`;
    if (pathname === onboardingPrefix || pathname.startsWith(`${onboardingPrefix}/`)) {
      return;
    }
    router.replace(onboardingPrefix);
  }, [enabled, completed, slug, pathname, router]);

  return null;
}