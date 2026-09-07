/**
 * Pure money/finance helpers — no database dependency.
 * Extracted from src/server/services/finance.ts for testability.
 */

import { Prisma } from "@/generated/prisma/client";

/** Accepted money input: up to 9 integer digits + optional 2 decimals. */
export const MONEY_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/** Maximum allowed money value. */
export const MAX_MONEY = new Prisma.Decimal("999999999.99");

/**
 * Round a float to 2 decimal places for display (avoids float drift).
 * The epsilon bump absorbs binary-float error so sums that land a hair below
 * a cent boundary (e.g. 0.1 + 0.2, 0.3 − 0.1) display as the clean value.
 *
 * Note: money is always stored as @db.Decimal(12,2), i.e. 2 decimal places,
 * so exact half-cent floats (e.g. 1.005) never originate from the database;
 * this helper only reconciles float accumulation drift on display.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** UTC-normalized day start for a Date (robust across timezones). */
export function toDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Start of the UTC day AFTER `d` — the exclusive upper bound of a day range.
 */
export function toDayEndExclusive(d: Date): Date {
  return new Date(toDayStart(d).getTime() + 86400000);
}
