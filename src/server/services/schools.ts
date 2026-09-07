import { cache } from "react";
import { db } from "@/server/db";

/**
 * Resolve a school tenant by its URL slug, memoized per-request with React.cache.
 *
 * Every query against tenant-scoped data MUST be keyed by the returned
 * `schoolId`. This is the single enforcement point for tenant isolation:
 * business modules should use this helper to scope reads/writes, never
 * query by slug directly inside feature code.
 *
 * Returns `null` when the school does not exist so callers can short-circuit
 * (e.g. render a not-found state) instead of throwing.
 */
export const getSchoolBySlug = cache(async (slug: string) => {
  return db.school.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      logoUrl: true,
      currency: true,
      timezone: true,
      motto: true,
      website: true,
      primaryColor: true,
      status: true,
    },
  });
});