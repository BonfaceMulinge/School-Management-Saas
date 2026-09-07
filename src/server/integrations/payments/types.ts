/**
 * Provider-agnostic payment abstraction (Phase 15).
 *
 * A PaymentProvider is a thin, stateless adapter over a payment gateway. The
 * application never trusts a client-reported success: a PaymentTransaction is
 * only marked SUCCEEDED after a server-side provider check (direct `getStatus`
 * call or a signature-verified webhook).
 */

export type ProviderPaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED";

export type PaymentInitiationRequest = {
  /** Stable key produced by `makeIdempotencyKey`; provider may use it. */
  idempotencyKey: string;
  /** Amount in minor units (cents) — avoids float drift. */
  amountMinor: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Human-readable description shown to payers. */
  description: string;
  /** Internal reference supplied for reconciliation (receipt / purpose). */
  reference: string;
  /** Safe, opaque metadata (never PII beyond what the gateway needs). */
  metadata?: Record<string, string>;
};

export type PaymentInitiationResponse = {
  /** Provider-issued transaction/reference id. */
  providerReference: string;
  /** Hosted checkout URL, when the provider redirects payers. */
  checkoutUrl: string | null;
  /** When the hosted session / pending link expires. */
  expiresAt: Date | null;
};

export type PaymentStatusResponse = {
  providerReference: string;
  status: ProviderPaymentStatus;
  /** Server-confirmed event id (webhook or status pull). */
  providerEventId?: string | null;
  /** Safe failure summary; never contains secrets. */
  failureReason?: string | null;
};

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

/** Normalized, already-verified webhook event. */
export type PaymentWebhookEvent = {
  providerEventId: string;
  eventType: string;
  status: ProviderPaymentStatus;
  amountMinor?: number;
  currency?: string;
  /** Expected to match `PaymentTransaction.providerReference`. */
  transactionRef?: string | null;
  /** Optional school hint from the provider payload — cross-checked, never trusted. */
  schoolRef?: string | null;
};

export interface PaymentProvider {
  readonly name: string;
  initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse>;
  getStatus(providerReference: string): Promise<PaymentStatusResponse>;
  /** Verify a webhook's origin (signature over the raw body). */
  verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null
  ): WebhookVerifyResult;
  /** Parse an already-verified payload into normalized fields. */
  parseWebhookEvent(payload: Record<string, unknown>): PaymentWebhookEvent;
}