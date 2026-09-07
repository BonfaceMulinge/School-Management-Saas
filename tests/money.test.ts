import { describe, it, expect } from "vitest";
import {
  roundMoney,
  toDayStart,
  toDayEndExclusive,
  MONEY_PATTERN,
} from "@/lib/money";

// ---------------------------------------------------------------------------
// roundMoney
// ---------------------------------------------------------------------------

describe("roundMoney", () => {
  it("recovers binary float drift from addition", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(0.05 + 0.1)).toBe(0.15);
    expect(roundMoney(0.3 - 0.1)).toBe(0.2);
    expect(roundMoney(0.3 - 0.1 - 0.1)).toBe(0.1);
  });

  it("recovers float drift for negative values", () => {
    expect(roundMoney(-0.1 + 0.2)).toBe(0.1);
    expect(roundMoney(-0.3 + 0.1)).toBe(-0.2);
  });

  it("recovers float drift on large values", () => {
    expect(roundMoney(100.9 - 90)).toBe(10.9);
    expect(roundMoney(1000000.1 + 0.2)).toBe(1000000.3);
  });

  it("leaves well-formed numbers unchanged", () => {
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(100.5)).toBe(100.5);
    expect(roundMoney(999999.99)).toBe(999999.99);
    expect(roundMoney(999.25)).toBe(999.25);
  });

  it("rounds to 2 places for 3+ decimal values", () => {
    expect(roundMoney(1.999)).toBe(2.0);
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(1.235)).toBe(1.24);
    expect(roundMoney(1.236)).toBe(1.24);
  });
});

// ---------------------------------------------------------------------------
// MONEY_PATTERN
// ---------------------------------------------------------------------------

describe("MONEY_PATTERN", () => {
  it("accepts valid money strings", () => {
    expect(MONEY_PATTERN.test("1")).toBe(true);
    expect(MONEY_PATTERN.test("1.00")).toBe(true);
    expect(MONEY_PATTERN.test("123.45")).toBe(true);
    expect(MONEY_PATTERN.test("999999999.99")).toBe(true);
    expect(MONEY_PATTERN.test("0.10")).toBe(true);
  });

  it("rejects invalid money strings", () => {
    expect(MONEY_PATTERN.test("")).toBe(false);
    expect(MONEY_PATTERN.test("abc")).toBe(false);
    expect(MONEY_PATTERN.test("1.000")).toBe(false); // >2 decimals
    expect(MONEY_PATTERN.test("1000000000.00")).toBe(false); // >9 integer digits
    expect(MONEY_PATTERN.test("-1")).toBe(false); // negative
    expect(MONEY_PATTERN.test("1.123")).toBe(false); // 3 decimals
  });
});

// ---------------------------------------------------------------------------
// toDayStart / toDayEndExclusive
// ---------------------------------------------------------------------------

describe("toDayStart", () => {
  it("sets time to midnight UTC", () => {
    const d = new Date("2025-06-15T14:30:00Z");
    const result = toDayStart(d);
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it("preserves the calendar date in UTC", () => {
    const d = new Date("2025-06-15T14:30:00Z");
    const result = toDayStart(d);
    expect(result.toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("normalizes late-night UTC times to the correct day", () => {
    const d = new Date("2025-06-15T23:59:59Z");
    const result = toDayStart(d);
    expect(result.toISOString().slice(0, 10)).toBe("2025-06-15");
  });
});

describe("toDayEndExclusive", () => {
  it("returns midnight UTC of the next day", () => {
    const d = new Date("2025-06-15T10:00:00Z");
    const result = toDayEndExclusive(d);
    expect(result.toISOString().slice(0, 10)).toBe("2025-06-16");
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("exclusive end minus start is exactly 86400000ms", () => {
    const d = new Date("2025-01-01T00:00:00Z");
    expect(toDayEndExclusive(d).getTime() - toDayStart(d).getTime()).toBe(86400000);
  });
});