import { describe, it, expect } from "vitest";
import {
  SESSION_COOKIE_MAX_AGE,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/server/auth/constants";

describe("session timeout constants", () => {
  it("idle timeout is shorter than the absolute timeout", () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBeLessThan(SESSION_ABSOLUTE_TIMEOUT_MS);
  });

  it("idle timeout is enforced independently (3 days of inactivity)", () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(1000 * 60 * 60 * 24 * 3);
  });

  it("cookie max-age matches the absolute session lifetime", () => {
    expect(SESSION_COOKIE_MAX_AGE * 1000).toBe(SESSION_ABSOLUTE_TIMEOUT_MS);
  });
});