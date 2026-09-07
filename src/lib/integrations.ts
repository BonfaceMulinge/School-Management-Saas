/**
 * Pure integration helpers (crypto / key generation) — no database and no
 * Next.js dependency, so they are unit-testable in isolation.
 *
 * Secrets are always passed in by the caller (read from environment
 * variables server-side) and never stored, logged, or leaked here.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Hex digest of an HMAC-SHA256 over `body` with `secret`. */
export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Constant-time hex string comparison. Returns false for unequal lengths or
 * any byte mismatch, guarding against timing attacks on signature checks.
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** SHA-256 hex digest (used for idempotency / dedupe keys and mock refs). */
export function sha256Hex(input: string): string {
  return createHmac("sha256", "sms-integration").update(input, "utf8").digest("hex");
}

/**
 * Deterministic dedupe key for outbound messages. A retried job with the same
 * inputs produces the same key, so the unique DB constraint stops duplicates.
 */
export function makeOutboundDedupeKey(parts: Array<string | number>): string {
  return `out_${sha256Hex(parts.join("|")).slice(0, 24)}`;
}

/**
 * Deterministic idempotency key for payment initiation. Re-initiating the
 * same logical payment (same actor + purpose + target + amount + window)
 * resolves to the existing transaction instead of creating a second one.
 */
export function makeIdempotencyKey(parts: Array<string | number>): string {
  return `pay_${sha256Hex(parts.join("|")).slice(0, 24)}`;
}

/** Minor units (cents) for a positive decimal amount string. */
export function toMinorUnits(amount: string): number {
  const normalized = amount.trim();
  const [whole, frac = ""] = normalized.split(".");
  const padded = (frac + "00").slice(0, 2);
  return Number.parseInt(whole.replace(/[^\d]/g, "") || "0", 10) * 100 + Number.parseInt(padded || "0", 10);
}