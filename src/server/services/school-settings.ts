import { cache } from "react";

import { db } from "@/server/db";
import type { SchoolSettings } from "@/generated/prisma/client";

/**
 * Read a school's configuration row. Returns `null` when no row exists (the
 * row is auto-created with the school, so this only happens for schools created
 * before Phase 12). Callers should fall back to defaults via
 * `mergeSchoolSettings(null)` in `@/lib/settings-types`.
 */
export const getSchoolSettings = cache(async (schoolId: string): Promise<SchoolSettings | null> => {
  return db.schoolSettings.findUnique({
    where: { schoolId },
  });
});