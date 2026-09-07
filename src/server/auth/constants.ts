import "server-only";

/**
 * Session lifetime constants (milliseconds).
 *
 * Cookie max age drives the client-side cookie expiry; the absolute timeout
 * is re-checked against the database record on every request so a tampered
 * cookie cannot keep a session alive past its legal lifetime.
 */
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds
export const SESSION_ABSOLUTE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
// Idle timeout is intentionally shorter than the absolute timeout so a stale
// session cannot linger open. It is enforced against lastUsedAt on validate.
export const SESSION_IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 3; // 3 days idle