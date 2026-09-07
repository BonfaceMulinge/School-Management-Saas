import "server-only";

import { hash, compare } from "bcryptjs";

export const PASSWORD_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt.
 * Never store or return plaintext passwords; this helper is the only place
 * password hashing happens.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, PASSWORD_ROUNDS);
}

/**
 * Compare a plaintext candidate against a stored bcrypt hash.
 * Uses a constant-time comparison internally.
 */
export function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return compare(password, passwordHash);
}