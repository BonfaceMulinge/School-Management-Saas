/**
 * Validate a "next" redirect target from user input. Returns a normalized
 * internal path, or null when the value is unsafe (absolute or
 * protocol-relative URLs are rejected to prevent open-redirect attacks).
 */
export function safeRedirect(target: unknown): string | null {
  if (typeof target !== "string" || target.length === 0) return null;
  if (!target.startsWith("/")) return null;
  if (target.startsWith("//") || target.startsWith("\\")) return null;
  return target;
}