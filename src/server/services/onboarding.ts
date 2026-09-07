import { cache } from "react";

import { db } from "@/server/db";

export type OnboardingState = {
  currentStep: number;
  completed: boolean;
  completedAt: Date | null;
};

/**
 * Read a school's onboarding progress. Schools created before Phase 12 have no
 * row and are always treated as completed so the onboarding flow never nags a
 * legacy tenant.
 */
export const getOnboardingForSchool = cache(
  async (schoolId: string): Promise<OnboardingState> => {
    const row = await db.schoolOnboarding.findUnique({
      where: { schoolId },
      select: { currentStep: true, completed: true, completedAt: true },
    });
    if (!row) return { currentStep: 5, completed: true, completedAt: null };
    return row;
  }
);