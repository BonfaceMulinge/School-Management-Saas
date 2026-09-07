import { describe, it, expect } from "vitest";
import { safeRedirect } from "@/lib/url";

describe("safeRedirect", () => {
  it("returns the target when it starts with /", () => {
    expect(safeRedirect("/dashboard")).toBe("/dashboard");
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/school/settings?page=1")).toBe("/school/settings?page=1");
  });

  it("returns null for non-string input", () => {
    expect(safeRedirect(null)).toBeNull();
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect(123)).toBeNull();
    expect(safeRedirect(true)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(safeRedirect("")).toBeNull();
  });

  it("rejects absolute URLs (open-redirect)", () => {
    expect(safeRedirect("https://evil.com")).toBeNull();
    expect(safeRedirect("http://evil.com")).toBeNull();
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRedirect("//evil.com")).toBeNull();
  });

  it("rejects backslash-protocol URLs", () => {
    expect(safeRedirect("\\\\evil.com")).toBeNull();
    expect(safeRedirect("\\evil.com")).toBeNull();
  });

  it("rejects paths not starting with /", () => {
    expect(safeRedirect("dashboard")).toBeNull();
    expect(safeRedirect("https://evil.com/path")).toBeNull();
  });

  it("allows nested paths", () => {
    expect(safeRedirect("/a/b/c")).toBe("/a/b/c");
  });

  it("preserves query strings", () => {
    expect(safeRedirect("/login?next=/home")).toBe("/login?next=/home");
  });
});
