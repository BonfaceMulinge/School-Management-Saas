import "server-only";

import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_ABSOLUTE_TIMEOUT_MS,
} from "@/server/auth/constants";

export type SessionConfig = {
  cookieName: string;
  cookieMaxAgeSeconds: number;
  absoluteTimeoutMs: number;
  secure: boolean;
};

/**
 * Session cookie and expiry settings.
 *
 * The max age is returned by the client and stored in the cookie; the
 * absolute session timeout is enforced server-side by looking up the session
 * `createdAt`/`expiresAt` in the database, so a forged cookie cannot extend a
 * session.
 */
export function getSessionConfig(): SessionConfig {
  return {
    cookieName: "sms_session",
    cookieMaxAgeSeconds: SESSION_COOKIE_MAX_AGE,
    absoluteTimeoutMs: SESSION_ABSOLUTE_TIMEOUT_MS,
    secure: process.env.NODE_ENV === "production",
  };
}