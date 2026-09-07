/**
 * Provider-agnostic email delivery abstraction (Phase 15).
 *
 * A provider is a thin, stateless adapter over an email API / SMTP gateway.
 * Production never fakes delivery: a message is only SENT when a real provider
 * returns success (or an explicit hand-off), otherwise OutboundMessage stays
 * QUEUED (PENDING) or is marked FAILED/SKIPPED.
 */

export type EmailSendRequest = {
  recipient: string;
  subject: string;
  /** Rendered HTML body (safe, school-derived content only). */
  html: string;
  /** Plain-text fallback; providers that only support text can use it. */
  text?: string;
};

export type EmailSendResult = {
  /** Provider-issued message id, when available. */
  providerReference?: string | null;
};

export interface EmailProvider {
  readonly name: string;
  send(req: EmailSendRequest): Promise<EmailSendResult>;
}