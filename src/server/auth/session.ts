import "server-only";

import { db } from "@/server/db";
import { generateSessionToken, hashSessionToken } from "@/server/auth/tokens";
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/server/auth/constants";

export type SessionValidationResult =
  | {
      session: {
        id: string;
        userId: string;
        expiresAt: Date;
        lastUsedAt: Date;
      };
    }
  | { session: null };

/**
 * Create a database-backed session for a user.
 * Returns the raw token that the caller stores in an httpOnly cookie and
 * should never persist anywhere else.
 */
export async function createSession(
  userId: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  await db.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS),
      userAgent: metadata?.userAgent ?? null,
      ipAddress: metadata?.ipAddress ?? null,
    },
  });

  return token;
}

/**
 * Resolve a raw session token to its database record, enforcing:
 *  - the token must exist,
 *  - the absolute session timeout must not have passed,
 *  - the idle timeout must not have passed.
 * The returned object deliberately excludes the token hash.
 */
export async function validateSession(
  token: string
): Promise<SessionValidationResult> {
  const tokenHash = hashSessionToken(token);

  const session = await db.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  if (!session) return { session: null };

  const now = Date.now();
  if (now > session.expiresAt.getTime()) return { session: null };
  if (now - session.lastUsedAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return { session: null };
  }

  return { session };
}

/**
 * Touch the session's last-used timestamp to support idle-timeout sliding.
 * Called on successful validation; failures are non-fatal.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await db.session
    .update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Destroy a session (logout or forced revocation). Deleting the row makes the
 * token permanently invalid even if the cookie is replayed.
 */
export async function invalidateSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.session.deleteMany({ where: { tokenHash } });
}