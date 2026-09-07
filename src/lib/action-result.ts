export type ActionResult<T = undefined> =
  | { ok: true; data?: T; redirectTo?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type FailureResult = Extract<ActionResult, { ok: false }>;

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult {
  return { ok: false, error, fieldErrors };
}

/**
 * Narrow a server-action result held by useActionState into its failure
 * variant (or null). Lets client code read `.error` / `.fieldErrors` without
 * tripping the discriminated union.
 */
export function failureOf<T>(
  result: ActionResult<T> | null | undefined
): FailureResult | null {
  return result && !result.ok ? result : null;
}