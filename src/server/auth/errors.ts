import "server-only";

/**
 * Thrown when a request has no valid authenticated session.
 * Maps to HTTP 401 Unauthorized semantics.
 */
export class UnauthorizedError extends Error {
  constructor(message = "You must be signed in to perform this action.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when an authenticated user lacks permission for a resource or action
 * (RBAC check failed, or no membership in the target tenant).
 * Maps to HTTP 403 Forbidden semantics.
 */
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
  return error instanceof UnauthorizedError;
}

export function isForbiddenError(error: unknown): error is ForbiddenError {
  return error instanceof ForbiddenError;
}