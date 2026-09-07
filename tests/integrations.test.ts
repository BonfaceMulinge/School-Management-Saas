import { describe, it, expect } from "vitest";
import {
  hmacSha256Hex,
  safeEqualHex,
  sha256Hex,
  makeIdempotencyKey,
  makeOutboundDedupeKey,
  toMinorUnits,
} from "@/lib/integrations";
import { renderEmail, renderTemplate, type EmailTemplateKey } from "@/server/integrations/email/templates";
import { renderSms, type SmsTemplateKey } from "@/server/integrations/sms/templates";
import { MockPaymentProvider } from "@/server/integrations/payments/mock-provider";

// ---------------------------------------------------------------------------
// lib/integrations — pure crypto / key helpers
// ---------------------------------------------------------------------------

describe("hmacSha256Hex", () => {
  it("is deterministic for the same secret and body", () => {
    expect(hmacSha256Hex("secret", "raw-body")).toBe(hmacSha256Hex("secret", "raw-body"));
  });

  it("differs across secrets and bodies", () => {
    expect(hmacSha256Hex("a", "raw-body")).not.toBe(hmacSha256Hex("b", "raw-body"));
    expect(hmacSha256Hex("secret", "one")).not.toBe(hmacSha256Hex("secret", "two"));
  });

  it("returns a 64-character lowercase hex digest", () => {
    const digest = hmacSha256Hex("k", "v");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("safeEqualHex", () => {
  it("accepts equal digests", () => {
    const d = hmacSha256Hex("secret", "body");
    expect(safeEqualHex(d, d)).toBe(true);
    expect(safeEqualHex("abc123", "abc123")).toBe(true);
  });

  it("rejects unequal digests", () => {
    const a = hmacSha256Hex("secret", "body");
    const b = hmacSha256Hex("secret", "changed");
    expect(safeEqualHex(a, b)).toBe(false);
    expect(safeEqualHex("abc123", "abc124")).toBe(false);
  });

  it("rejects mismatched or empty lengths", () => {
    expect(safeEqualHex("abcd", "abc")).toBe(false);
    expect(safeEqualHex("", "")).toBe(false);
  });
});

describe("sha256Hex / key helpers", () => {
  it("hashes deterministically to 64 hex chars", () => {
    expect(sha256Hex("anything")).toBe(sha256Hex("anything"));
    expect(sha256Hex("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds deterministic, prefixed idempotency keys", () => {
    const a = makeIdempotencyKey(["u-1", "fee", "s-1", "125.00", "2026-09-07"]);
    const b = makeIdempotencyKey(["u-1", "fee", "s-1", "125.00", "2026-09-07"]);
    expect(a).toBe(b);
    expect(a.startsWith("pay_")).toBe(true);
    expect(a.length).toBe(28);
    const c = makeIdempotencyKey(["u-1", "fee", "s-1", "125.01", "2026-09-07"]);
    expect(c).not.toBe(a);
  });

  it("builds deterministic, prefixed outbound dedupe keys", () => {
    const a = makeOutboundDedupeKey(["s-1", "payment-confirmation", "tx-9"]);
    const b = makeOutboundDedupeKey(["s-1", "payment-confirmation", "tx-9"]);
    expect(a).toBe(b);
    expect(a.startsWith("out_")).toBe(true);
  });
});

describe("toMinorUnits", () => {
  it("converts decimal amounts to minor units", () => {
    expect(toMinorUnits("125.50")).toBe(12550);
    expect(toMinorUnits("125.5")).toBe(12550);
    expect(toMinorUnits("0.10")).toBe(10);
    expect(toMinorUnits("1")).toBe(100);
    expect(toMinorUnits("999999999.99")).toBe(99999999999);
    expect(toMinorUnits("0")).toBe(0);
  });

  it("truncates beyond two decimals rather than rounding", () => {
    expect(toMinorUnits("1.999")).toBe(199);
  });
});

// ---------------------------------------------------------------------------
// Email + SMS templates — pure rendering
// ---------------------------------------------------------------------------

const emailKeys: EmailTemplateKey[] = [
  "welcome",
  "account",
  "payment-receipt",
  "subscription-activated",
  "subscription-renewed",
  "fee-reminder",
  "announcement",
];

describe("renderEmail", () => {
  it("renders subscription templates with required variables", () => {
    const result = renderEmail("subscription-activated", {
      schoolName: "Alpha Academy",
      currency: "USD",
      amount: "250.00",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.subject).toContain("active");
    expect(result.template.html).toContain("Alpha Academy");
    expect(result.template.html).toContain("USD 250.00");
    expect(result.template.text).toContain("USD 250.00");
  });

  it("renders payment receipts with the reference", () => {
    const result = renderEmail("payment-receipt", {
      schoolName: "Beta School",
      currency: "KES",
      amount: "1200.00",
      reference: "mock_tx_abc",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.html).toContain("mock_tx_abc");
    expect(result.template.text).toContain("1200.00");
  });

  it("reports missing required variables instead of sending broken content", () => {
    const result = renderEmail("payment-receipt", {
      schoolName: "Beta School",
      currency: "KES",
      amount: "1200.00",
    });
    expect(result).toMatchObject({ ok: false, missing: ["reference"] });
  });

  it("keeps unknown placeholders untouched", () => {
    const result = renderEmail("announcement", { subject: "Result day", body: "Results are out." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template.subject).not.toContain("{{");
    // An unrecognized var reference stays literal so content is never silently corrupted.
    expect(renderTemplate("Hello {{name}}", { other: "x" })).toBe("Hello {{name}}");
  });

  it("exposes every template family with a non-empty subject", () => {
    for (const key of emailKeys) {
      const t = renderEmail(key, { subject: "x", body: "y", recipientName: "n", schoolName: "s", currency: "C", amount: "1", reference: "r", studentName: "st", message: "m" });
      expect(t.ok).toBe(true);
      if (!t.ok) continue;
      expect(t.template.subject.length).toBeGreaterThan(0);
    }
  });
});

const smsKeys: SmsTemplateKey[] = ["fee-reminder", "payment-confirmation", "announcement", "account"];

describe("renderSms", () => {
  it("renders a payment confirmation with school name and amount", () => {
    const out = renderSms("payment-confirmation", {
      schoolName: "Alpha Academy",
      currency: "USD",
      amount: "80.00",
    });
    expect(out).toContain("Alpha Academy");
    expect(out).toContain("USD 80.00");
    expect(out).not.toContain("{{");
  });

  it("renders fee reminders with student name", () => {
    const out = renderSms("fee-reminder", {
      schoolName: "Alpha Academy",
      currency: "USD",
      amount: "45.50",
      studentName: "Alice",
    });
    expect(out).toContain("Alice");
    expect(out).toContain("45.50");
  });

  it("keeps missing variables literal (no silent corruption)", () => {
    const out = renderSms("account", { schoolName: "Beta School" });
    expect(out).toContain("Beta School");
    expect(out).toContain("{{message}}");
  });

  it("renders every SMS template family", () => {
    for (const key of smsKeys) {
      expect(() =>
        renderSms(key, { schoolName: "s", body: "b", message: "m", studentName: "st", currency: "C", amount: "1" })
      ).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// MockPaymentProvider — deterministic, dev-only provider behavior
// ---------------------------------------------------------------------------

describe("MockPaymentProvider.initiate", () => {
  it("returns a deterministic reference for the same idempotency key", async () => {
    const provider = new MockPaymentProvider({ secret: "s" });
    const a = await provider.initiate({ idempotencyKey: "pay_k", amountMinor: 1000, currency: "USD", description: "d", reference: "tx-1" });
    const b = await provider.initiate({ idempotencyKey: "pay_k", amountMinor: 1000, currency: "USD", description: "d", reference: "tx-1" });
    expect(a.providerReference).toBe(b.providerReference);
    expect(a.providerReference).toMatch(/^mock_tx_[0-9a-f]{16}$/);
    expect(a.checkoutUrl).toContain(a.providerReference);
  });

  it("produces different references for different keys", async () => {
    const provider = new MockPaymentProvider();
    const a = await provider.initiate({ idempotencyKey: "one", amountMinor: 1, currency: "USD", description: "d", reference: "t1" });
    const b = await provider.initiate({ idempotencyKey: "two", amountMinor: 1, currency: "USD", description: "d", reference: "t2" });
    expect(a.providerReference).not.toBe(b.providerReference);
  });
});

describe("MockPaymentProvider.getStatus", () => {
  const key = "pay_abc";
  async function reference() {
    return (await new MockPaymentProvider().initiate({ idempotencyKey: key, amountMinor: 1, currency: "USD", description: "d", reference: "t" })).providerReference;
  }

  it("succeeds by default with a deterministic event id", async () => {
    const ref = await reference();
    const provider = new MockPaymentProvider();
    const status = await provider.getStatus(ref);
    expect(status).toMatchObject({ providerReference: ref, status: "SUCCEEDED", failureReason: null });
    expect(status.providerEventId).toMatch(/^mock_evt_[0-9a-f]{16}$/);
  });

  it("returns FAILED with a reason for failing references", async () => {
    const ref = await reference();
    const provider = new MockPaymentProvider({ failingReferences: [ref] });
    const status = await provider.getStatus(ref);
    expect(status.status).toBe("FAILED");
    expect(status.failureReason).toBeTruthy();
    expect(status.providerEventId).toBeNull();
  });

  it("returns PENDING for pending references", async () => {
    const ref = await reference();
    const provider = new MockPaymentProvider({ pendingReferences: [ref] });
    const status = await provider.getStatus(ref);
    expect(status.status).toBe("PENDING");
    expect(status.providerEventId).toBeNull();
  });
});

describe("MockPaymentProvider.verifyWebhookSignature", () => {
  const body = JSON.stringify({ id: "e1", data: { status: "succeeded" } });

  it("rejects when no secret is configured", () => {
    const provider = new MockPaymentProvider({ secret: null });
    expect(provider.verifyWebhookSignature(body, hmacSha256Hex("s", body))).toMatchObject({ ok: false });
  });

  it("rejects a missing signature header", () => {
    const provider = new MockPaymentProvider({ secret: "s" });
    expect(provider.verifyWebhookSignature(body, null)).toMatchObject({ ok: false });
  });

  it("rejects a signature from the wrong secret", () => {
    const provider = new MockPaymentProvider({ secret: "s" });
    expect(provider.verifyWebhookSignature(body, hmacSha256Hex("WRONG", body))).toMatchObject({ ok: false });
  });

  it("accepts a valid signature", () => {
    const provider = new MockPaymentProvider({ secret: "s" });
    expect(provider.verifyWebhookSignature(body, hmacSha256Hex("s", body))).toEqual({ ok: true });
  });
});

describe("MockPaymentProvider.parseWebhookEvent", () => {
  it("maps provider statuses onto provider status names", () => {
    const provider = new MockPaymentProvider();
    expect(provider.parseWebhookEvent({ id: "e1", data: { status: "failed" } }).status).toBe("FAILED");
    expect(provider.parseWebhookEvent({ id: "e2", data: { status: "pending" } }).status).toBe("PENDING");
    expect(provider.parseWebhookEvent({ id: "e3", data: { status: "succeeded" } }).status).toBe("SUCCEEDED");
  });

  it("carries transaction and school references", () => {
    const provider = new MockPaymentProvider();
    const event = provider.parseWebhookEvent({
      id: "e1",
      type: "payment.completed",
      data: { status: "succeeded", transactionReference: "mock_tx_x", schoolRef: "school-1", amountMinor: 12500 },
    });
    expect(event).toMatchObject({
      providerEventId: "e1",
      eventType: "payment.completed",
      transactionRef: "mock_tx_x",
      schoolRef: "school-1",
      amountMinor: 12500,
    });
  });
});