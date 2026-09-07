import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { db } from "@/server/db";
import { getSessionConfig } from "@/server/auth/config";
import { touchSession, validateSession } from "@/server/auth/session";

/**
 * Minimal, safe representation of the signed-in user.
 * Deliberately excludes passwordHash and any other sensitive columns so it
 * can never leak to the client.
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  platformRole: "SUPER_ADMIN" | "SUPPORT" | null;
};

export type AuthSession = {
  id: string;
  userId: string;
  user: SessionUser;
};

/**
 * Resolve the current authenticated session from the session cookie.
 *
 * Memoized per-request with React.cache so page, layout, and action code can
 * call it freely without duplicate DB lookups. Runs the full server-side
 * validation (token hash lookup + absolute and idle timeouts).
 *
 * The raw token is intentionally NOT returned here; it must never reach React
 * components. Mutations that need it use `getSessionToken()` inside a Server
 * Function only.
 */
export const getCurrentSession = cache(
  async (): Promise<AuthSession | null> => {
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionConfig().cookieName)?.value;
    if (!token) return null;

    const result = await validateSession(token);
    if (!result.session) return null;

    const user = await db.user.findUnique({
      where: { id: result.session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        platformRole: true,
      },
    });
    if (!user) return null;

    // Fire-and-forget idle timestamp refresh; failures are non-fatal.
    void touchSession(result.session.id);

    return { id: result.session.id, userId: user.id, user };
  }
);

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  return (await getCurrentSession())?.user ?? null;
});

/**
 * Read the raw session token. For Server Functions / Route Handlers only
 * (e.g. logout invalidation); calling this inside a React render is an error
 * — use `getCurrentSession()` instead.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionConfig().cookieName)?.value ?? null;
}