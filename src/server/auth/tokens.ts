import "server-only";

import { createHash, randomBytes } from "crypto";

const TOKEN_BYTES = 32;

/**
 * Generate a cryptographically random session token.
 * The raw token is placed in an httpOnly cookie; only its hash is persisted.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a session token with SHA-256.
 *
 * The database stores only this hash. If the database is ever leaked, the raw
 * tokens remain useless, and lookups are done by constant-time hash match.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}