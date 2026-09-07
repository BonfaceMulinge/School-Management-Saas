/**
 * Mock payment provider (Phase 15).
 *
 * This provider is for development and automated tests ONLY. It behaves like a
 * real gateway from the application's point of view:
 *  * initiate() issues a deterministic provider reference derived from the
 *    idempotency key (a re-init with the same key returns a reference whose
 *    later status/event is identical, which is what makes replay dedupe testable).
 *  * getStatus() resolves references deterministically — SUCCEEDED by default,
 *    FAILED when the reference was registered as failing, PENDING when pending.
 *  * webhooks are HMAC-SHA256 signed with `PAYMENT_PROVIDER_KEY` (no key ⇒ the
 *    integration is "not configured" and webhooks reject).
 *
 * It never claims real-provider behavior and no credentials are ever embedded.
 */

import {
  hmacSha256Hex,
  safeEqualHex,
  sha256Hex,
} from "@/lib/integrations";
import type {
  PaymentInitiationRequest,
  PaymentInitiationResponse,
  PaymentStatusResponse,
  PaymentWebhookEvent,
  PaymentProvider,
  ProviderPaymentStatus,
  WebhookVerifyResult,
} from "./types";

export type MockProviderOptions = {
  /** Shared webhook signing secret (read from env by the caller). */
  secret?: string | null;
  /** Provider references that should verify as FAILED. */
  failingReferences?: string[];
  /** Provider references that stay PENDING. */
  pendingReferences?: string[];
};

const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  private readonly secret: string | null;
  private readonly failing: Set<string>;
  private readonly pending: Set<string>;

  constructor(options: MockProviderOptions = {}) {
    this.secret = options.secret ?? null;
    this.failing = new Set(options.failingReferences ?? []);
    this.pending = new Set(options.pendingReferences ?? []);
  }

  private referenceFor(idempotencyKey: string): string {
    return `mock_tx_${sha256Hex(idempotencyKey).slice(0, 16)}`;
  }

  private eventIdFor(providerReference: string): string {
    return `mock_evt_${sha256Hex(providerReference).slice(0, 16)}`;
  }

  async initiate(req: PaymentInitiationRequest): Promise<PaymentInitiationResponse> {
    const providerReference = this.referenceFor(req.idempotencyKey);
    return {
      providerReference,
      checkoutUrl: `/api/payments/mock/checkout?ref=${encodeURIComponent(providerReference)}`,
      expiresAt: new Date(Date.now() + DEFAULT_EXPIRY_MS),
    };
  }

  async getStatus(providerReference: string): Promise<PaymentStatusResponse> {
    let status: ProviderPaymentStatus = "SUCCEEDED";
    let failureReason: string | null = null;
    if (this.failing.has(providerReference)) {
      status = "FAILED";
      failureReason = "Payment declined by the mock provider.";
    } else if (this.pending.has(providerReference)) {
      status = "PENDING";
    }
    return {
      providerReference,
      status,
      providerEventId: status === "SUCCEEDED" ? this.eventIdFor(providerReference) : null,
      failureReason,
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): WebhookVerifyResult {
    if (!this.secret) {
      return { ok: false, reason: "Payment provider is not configured." };
    }
    if (!signatureHeader) {
      return { ok: false, reason: "Missing webhook signature header." };
    }
    const expected = hmacSha256Hex(this.secret, rawBody);
    if (!safeEqualHex(expected, signatureHeader)) {
      return { ok: false, reason: "Webhook signature verification failed." };
    }
    return { ok: true };
  }

  parseWebhookEvent(payload: Record<string, unknown>): PaymentWebhookEvent {
    const id = String(payload.id ?? payload.providerEventId ?? "");
    const type = String(payload.type ?? "payment.completed");
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};
    const status = String(data.status ?? "succeeded");
    return {
      providerEventId: id || this.eventIdFor(String(data.transactionReference ?? "")),
      eventType: type,
      status: status === "failed" ? "FAILED" : status === "pending" ? "PENDING" : "SUCCEEDED",
      amountMinor:
        typeof data.amountMinor === "number" ? data.amountMinor : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      transactionRef:
        typeof data.transactionReference === "string"
          ? data.transactionReference
          : null,
      schoolRef: typeof data.schoolRef === "string" ? data.schoolRef : null,
    };
  }
}