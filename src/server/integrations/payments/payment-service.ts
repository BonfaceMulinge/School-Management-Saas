/**
 * Payment orchestration service (Phase 15).
 *
 * Single entry points for initiating provider payments (fee + subscription),
 * verifying them server-side, and applying provider webhooks. Rules enforced
 * here:
 *  * A transaction is created PENDING on initiation and only becomes
 *    SUCCEEDED after a server-side provider check.
 *  * Application is guarded by the transaction status inside a Serializable
 *    transaction, so a concurrent webhook + verify call can never double-apply.
 *  * Webhook processing derives tenant and amount exclusively from the stored
 *    PaymentTransaction — payload-supplied school/amount hints are cross-checked,
 *    never trusted.
 */

import { randomBytes } from "crypto";

import { Prisma } from "@/generated/prisma/client";
import type {
  PaymentTransaction,
  PaymentTransactionStatus,
  Prisma as PrismaTypes,
} from "@/generated/prisma/client";
import { db } from "@/server/db";
import { createAuditLog } from "@/server/services/audit-log";
import { resolveEnrollmentSnapshot } from "@/server/services/finance";
import { notifyGuardiansOfStudent } from "@/server/services/communication";
import { getIntegrationConfig } from "@/server/integrations/config";
import { toDayStart } from "@/lib/money";
import { sendOutboundEmail, sendOutboundSms } from "@/server/integrations/outbound";
import { MockPaymentProvider } from "./mock-provider";
import type { PaymentProvider } from "./types";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export type InitiateFeePaymentInput = {
  schoolId: string;
  studentId: string;
  amount: Prisma.Decimal;
  currency: string;
  idempotencyKey: string;
  initiatedById: string;
};

export type InitiateResult =
  | {
      ok: true;
      transactionId: string;
      provider: string;
      providerReference: string | null;
      checkoutUrl: string | null;
      status: PaymentTransactionStatus;
      reused: boolean;
    }
  | { ok: false; error: string };

export type VerifyResult =
  | {
      ok: true;
      status: "SUCCEEDED";
      transactionId: string;
      feePaymentId?: string;
    }
  | { ok: true; status: "PENDING" | "FAILED" | "EXPIRED"; transactionId: string }
  | { ok: false; error: string };

export type WebhookProcessResult = {
  code: number;
  status: "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
  note: string;
  eventId?: string;
};

/**
 * Resolve the configured payment provider. Accepts a `providerOverride` in
 * tests or callers who already hold a provider instance. The mock provider can
 * be configured to fail/pend specific references via config `meta` — useful
 * for deterministic sandbox and test runs.
 */
export async function resolvePaymentProvider(opts?: {
  providerOverride?: PaymentProvider | null;
  secretOverride?: string | null;
}): Promise<PaymentProvider | null> {
  if (opts?.providerOverride !== undefined) return opts.providerOverride;

  const cfg = await getIntegrationConfig("PAYMENT");
  if (!cfg.enabled || !cfg.provider) return null;

  if (cfg.provider === "mock") {
    const meta = (cfg.meta ?? {}) as {
      failingReferences?: string[];
      pendingReferences?: string[];
    };
    return new MockPaymentProvider({
      secret: opts?.secretOverride !== undefined ? opts.secretOverride : process.env.PAYMENT_PROVIDER_KEY ?? null,
      failingReferences: meta.failingReferences ?? [],
      pendingReferences: meta.pendingReferences ?? [],
    });
  }

  // Real providers (Stripe, Flutterwave, …) are registered here before the
  // config UI offers them. Until one is wired, unknown names stay unconfigured.
  return null;
}

function txAmountMinor(amount: Prisma.Decimal): number {
  return Math.round(Number(amount.toString()) * 100);
}

async function createPendingTransaction(data: {
  schoolId: string;
  purpose: "FEE_PAYMENT" | "SUBSCRIPTION";
  studentId?: string;
  subscriptionId?: string;
  amount: Prisma.Decimal;
  currency: string;
  idempotencyKey: string;
  providerName: string;
  initiatedById: string;
}): Promise<PaymentTransaction> {
  return db.paymentTransaction.create({
    data: {
      schoolId: data.schoolId,
      purpose: data.purpose,
      studentId: data.studentId,
      subscriptionId: data.subscriptionId,
      amount: data.amount,
      currency: data.currency,
      idempotencyKey: data.idempotencyKey,
      provider: data.providerName,
      status: "PENDING",
      initiatedById: data.initiatedById,
    },
  });
}

/** Initiate a fee payment for a student's outstanding balance. */
export async function initiateFeePayment(
  input: InitiateFeePaymentInput
): Promise<InitiateResult> {
  const provider = await resolvePaymentProvider();
  if (!provider) {
    return { ok: false, error: "No payment provider is configured. Ask the platform administrator to enable one." };
  }

  const existing = await db.paymentTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, provider: true, providerReference: true, checkoutUrl: true, status: true },
  });
  if (existing) {
    return {
      ok: true,
      transactionId: existing.id,
      provider: existing.provider,
      providerReference: existing.providerReference,
      checkoutUrl: existing.checkoutUrl,
      status: existing.status,
      reused: true,
    };
  }

  const tx = await createPendingTransaction({
    schoolId: input.schoolId,
    purpose: "FEE_PAYMENT",
    studentId: input.studentId,
    amount: input.amount,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    providerName: provider.name,
    initiatedById: input.initiatedById,
  });

  try {
    const initiated = await provider.initiate({
      idempotencyKey: input.idempotencyKey,
      amountMinor: txAmountMinor(tx.amount),
      currency: tx.currency,
      description: `School fee payment — ${tx.currency} ${tx.amount.toString()}`,
      reference: tx.id,
      metadata: { purpose: "FEE_PAYMENT", schoolId: input.schoolId, studentId: input.studentId },
    });

    const updated = await db.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        providerReference: initiated.providerReference,
        checkoutUrl: initiated.checkoutUrl,
        expiryAt: initiated.expiresAt,
      },
    });

    await createAuditLog({
      schoolId: input.schoolId,
      actorId: input.initiatedById,
      action: "PAYMENT_INITIATED",
      entity: "PaymentTransaction",
      entityId: tx.id,
      metadata: {
        purpose: "FEE_PAYMENT",
        studentId: input.studentId,
        amount: tx.amount.toString(),
        currency: tx.currency,
        provider: provider.name,
        providerReference: initiated.providerReference,
      },
    });

    return {
      ok: true,
      transactionId: updated.id,
      provider: updated.provider,
      providerReference: updated.providerReference,
      checkoutUrl: updated.checkoutUrl,
      status: updated.status,
      reused: false,
    };
  } catch {
    await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: "Provider initiation failed." },
    });
    return { ok: false, error: "The payment provider could not initiate the payment. Try again." };
  }
}

/** Initiate a SaaS subscription payment for a school's plan. */
export async function initiateSubscriptionPayment(input: {
  schoolId: string;
  subscriptionId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  initiatedById: string;
}): Promise<InitiateResult> {
  const provider = await resolvePaymentProvider();
  if (!provider) {
    return { ok: false, error: "No payment provider is configured. Ask the platform administrator to enable one." };
  }

  const existing = await db.paymentTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, provider: true, providerReference: true, checkoutUrl: true, status: true },
  });
  if (existing) {
    return {
      ok: true,
      transactionId: existing.id,
      provider: existing.provider,
      providerReference: existing.providerReference,
      checkoutUrl: existing.checkoutUrl,
      status: existing.status,
      reused: true,
    };
  }

  const amount = new Prisma.Decimal(input.amountMinor).div(100);
  const tx = await createPendingTransaction({
    schoolId: input.schoolId,
    purpose: "SUBSCRIPTION",
    subscriptionId: input.subscriptionId,
    amount,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
    providerName: provider.name,
    initiatedById: input.initiatedById,
  });

  try {
    const initiated = await provider.initiate({
      idempotencyKey: input.idempotencyKey,
      amountMinor: input.amountMinor,
      currency: input.currency,
      description: `SaaS subscription — ${input.currency} ${amount.toString()}`,
      reference: tx.id,
      metadata: { purpose: "SUBSCRIPTION", schoolId: input.schoolId, subscriptionId: input.subscriptionId },
    });

    const updated = await db.paymentTransaction.update({
      where: { id: tx.id },
      data: {
        providerReference: initiated.providerReference,
        checkoutUrl: initiated.checkoutUrl,
        expiryAt: initiated.expiresAt,
      },
    });

    await createAuditLog({
      schoolId: input.schoolId,
      actorId: input.initiatedById,
      action: "PAYMENT_INITIATED",
      entity: "PaymentTransaction",
      entityId: tx.id,
      metadata: {
        purpose: "SUBSCRIPTION",
        subscriptionId: input.subscriptionId,
        amount: amount.toString(),
        currency: input.currency,
        provider: provider.name,
        providerReference: initiated.providerReference,
      },
    });

    return {
      ok: true,
      transactionId: updated.id,
      provider: updated.provider,
      providerReference: updated.providerReference,
      checkoutUrl: updated.checkoutUrl,
      status: updated.status,
      reused: false,
    };
  } catch {
    await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: "Provider initiation failed." },
    });
    return { ok: false, error: "The payment provider could not initiate the payment. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Application (server-verified money movement)
// ---------------------------------------------------------------------------

type ApplyOutcome =
  | { applied: true; feePaymentId?: string }
  | { applied: false; reason: string };

/**
 * Create the FeePayment (ONLINE) inside a Serializable transaction and mark
 * the payment transaction SUCCEEDED. Reuses `resolveEnrollmentSnapshot` and
 * the existing ledger fields so provider payments flow through the exact same
 * FeePayment/ledger architecture as cash/bank receipts.
 */
async function applyFeePayment(
  transaction: PaymentTransaction,
  providerEventId: string | null,
  verifiedById: string | null
): Promise<ApplyOutcome> {
  const actorIdValid = verifiedById ?? transaction.initiatedById;

  const outcome = await db.$transaction(
    async (px) => {
      const current = await px.paymentTransaction.findUnique({
        where: { id: transaction.id },
        select: { status: true },
      });
      if (!current) return { applied: false, reason: "Payment transaction no longer exists." } as ApplyOutcome;
      if (current.status !== "PENDING") {
        return { applied: false, reason: `Payment transaction is already ${current.status.toLowerCase()}.` } as ApplyOutcome;
      }

      const activeYear = await px.academicYear.findFirst({
        where: { schoolId: transaction.schoolId, isActive: true },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (!activeYear) {
        return { applied: false, reason: "The school has no active academic year to attach the payment to." } as ApplyOutcome;
      }
      const activeTerm = await px.term.findFirst({
        where: { academicYearId: activeYear.id, isActive: true },
        select: { id: true },
      });
      const snapshot = await resolveEnrollmentSnapshot(
        transaction.schoolId,
        transaction.studentId ?? "",
        activeYear.id,
        activeTerm?.id ?? null
      );
      if (!snapshot) {
        return { applied: false, reason: "The student has no class enrollment to snapshot the payment against." } as ApplyOutcome;
      }

      const receiptNo = `RCP-${new Date().getFullYear()}-OL-${randomBytes(3).toString("hex").toUpperCase()}`;

      const feePayment = await px.feePayment.create({
        data: {
          schoolId: transaction.schoolId,
          studentId: transaction.studentId ?? "",
          receiptNo,
          amount: transaction.amount,
          date: toDayStart(new Date()),
          method: "ONLINE",
          provider: transaction.provider,
          providerReference: transaction.providerReference ?? null,
          providerEventId,
          verifiedById,
          verifiedAt: new Date(),
          referenceNo: transaction.providerReference ?? null,
          note: `Processed online via ${transaction.provider}.`,
          academicYearId: activeYear.id,
          termId: activeTerm?.id ?? null,
          classId: snapshot.classId,
          streamId: snapshot.streamId,
          recordedById: actorIdValid ?? "",
        },
        select: { id: true, receiptNo: true },
      });

      await px.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "SUCCEEDED",
          feePaymentId: feePayment.id,
          providerEventId,
          verifiedById,
          verifiedAt: new Date(),
          succeededAt: new Date(),
        },
      });

      await px.auditLog.create({
        data: {
          schoolId: transaction.schoolId,
          actorId: actorIdValid ?? "",
          action: "FINANCIAL_ACTION",
          entity: "FeePayment",
          entityId: feePayment.id,
          metadata: {
            type: "record-online",
            studentId: transaction.studentId,
            receiptNo: feePayment.receiptNo,
            amount: transaction.amount.toString(),
            method: "ONLINE",
            provider: transaction.provider,
            providerReference: transaction.providerReference ?? null,
            source: verifiedById ? "manual-verification" : "webhook",
          },
        },
      });
      await px.auditLog.create({
        data: {
          schoolId: transaction.schoolId,
          actorId: actorIdValid ?? "",
          action: "PAYMENT_VERIFIED",
          entity: "PaymentTransaction",
          entityId: transaction.id,
          metadata: {
            provider: transaction.provider,
            providerReference: transaction.providerReference ?? null,
            providerEventId,
            amount: transaction.amount.toString(),
            source: verifiedById ? "manual-verification" : "webhook",
          },
        },
      });

      return { applied: true, feePaymentId: feePayment.id } as ApplyOutcome;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }
  );

  if (outcome.applied) {
    void notifyGuardiansOfStudent(transaction.schoolId, transaction.studentId ?? "", {
      type: "FEE_PAYMENT",
      title: "Fee payment received",
      message: `An online fee payment (${transaction.currency} ${transaction.amount.toString()}) was verified for this student.`,
    });

    void sendPaymentReceipt(transaction, actorIdValid);
  }

  return outcome;
}

async function sendPaymentReceipt(transaction: PaymentTransaction, recipientUserId: string | null) {
  try {
    const school = await db.school.findUnique({
      where: { id: transaction.schoolId },
      select: { name: true, email: true, currency: true },
    });
    if (!school?.email) return;
    void sendOutboundEmail({
      schoolId: transaction.schoolId,
      userId: recipientUserId ?? undefined,
      template: "payment-receipt",
      to: school.email,
      vars: {
        schoolName: school.name,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        reference: transaction.providerReference ?? transaction.id,
      },
      dedupeKey: `receipt-${transaction.id}`,
    });
    void sendOutboundSms({
      schoolId: transaction.schoolId,
      template: "payment-confirmation",
      toSchoolContact: true,
      vars: {
        schoolName: school.name,
        amount: transaction.amount.toString(),
        currency: transaction.currency,
      },
      dedupeKey: `sms-receipt-${transaction.id}`,
    });
  } catch {
    // Outbound delivery is best-effort and never affects money movement.
  }
}

/**
 * Apply a subscription payment: activate, renew, or lift a failed/expired
 * subscription. History stays append-only via SubscriptionEvent rows.
 */
async function applySubscriptionPayment(
  transaction: PaymentTransaction,
  providerEventId: string | null,
  verifiedById: string | null
): Promise<ApplyOutcome> {
  const actorIdValid = verifiedById ?? transaction.initiatedById;

  const outcome = await db.$transaction(
    async (px) => {
      const current = await px.paymentTransaction.findUnique({
        where: { id: transaction.id },
        select: { status: true },
      });
      if (!current) return { applied: false, reason: "Payment transaction no longer exists." } as ApplyOutcome;
      if (current.status !== "PENDING") {
        return { applied: false, reason: `Payment transaction is already ${current.status.toLowerCase()}.` } as ApplyOutcome;
      }

      const sub = await px.schoolSubscription.findUnique({
        where: { id: transaction.subscriptionId ?? "" },
        select: { id: true, schoolId: true, planId: true, status: true, startDate: true, endDate: true, gracePeriodEnd: true },
      });
      if (!sub || sub.schoolId !== transaction.schoolId) {
        return { applied: false, reason: "Subscription not found for this payment." } as ApplyOutcome;
      }

      const now = new Date();
      const base = sub.endDate && sub.endDate > now ? sub.endDate : now;
      const newEnd = new Date(base.getTime() + ONE_YEAR_MS);
      const renewed = sub.status === "ACTIVE" && sub.endDate !== null && sub.endDate > now;

      await px.schoolSubscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          endDate: newEnd,
          gracePeriodEnd: null,
          cancelledAt: null,
          paymentRef: transaction.providerReference ?? null,
          provider: transaction.provider,
          providerReference: transaction.providerReference ?? null,
          providerEventId,
          updatedById: actorIdValid ?? "",
        },
      });

      await px.subscriptionEvent.create({
        data: {
          schoolId: sub.schoolId,
          subscriptionId: sub.id,
          planId: sub.planId,
          type: renewed ? "RENEWED" : "STATUS_CHANGED",
          fromStatus: sub.status,
          toStatus: "ACTIVE",
          startDate: sub.startDate,
          endDate: newEnd,
          gracePeriodEnd: null,
          reason: renewed ? "Subscription renewed (payment verified)." : "Subscription activated (payment verified).",
          reference: transaction.providerReference ?? null,
          actorId: actorIdValid ?? "",
        },
      });

      await px.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "SUCCEEDED",
          providerEventId,
          verifiedById,
          verifiedAt: new Date(),
          succeededAt: new Date(),
        },
      });

      await px.auditLog.create({
        data: {
          schoolId: sub.schoolId,
          actorId: actorIdValid ?? "",
          action: "SUBSCRIPTION_STATUS_CHANGE",
          entity: "SchoolSubscription",
          entityId: sub.id,
          metadata: {
            from: sub.status,
            to: "ACTIVE",
            endDate: newEnd.toISOString(),
            source: verifiedById ? "manual-verification" : "webhook",
          },
        },
      });
      await px.auditLog.create({
        data: {
          schoolId: sub.schoolId,
          actorId: actorIdValid ?? "",
          action: "PAYMENT_VERIFIED",
          entity: "PaymentTransaction",
          entityId: transaction.id,
          metadata: {
            provider: transaction.provider,
            providerReference: transaction.providerReference ?? null,
            providerEventId,
            amount: transaction.amount.toString(),
            purpose: "SUBSCRIPTION",
            source: verifiedById ? "manual-verification" : "webhook",
          },
        },
      });

      void sendSubscriptionNotification(sub.schoolId, renewed, transaction.amount.toString(), transaction.currency, transaction.id);

      return { applied: true } as ApplyOutcome;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 }
  );

  return outcome;
}

async function sendSubscriptionNotification(
  schoolId: string,
  renewed: boolean,
  amount: string,
  currency: string,
  transactionId: string
) {
  try {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { name: true, email: true },
    });
    if (!school?.email) return;
    void sendOutboundEmail({
      schoolId,
      template: renewed ? "subscription-renewed" : "subscription-activated",
      to: school.email,
      vars: { schoolName: school.name, amount, currency },
      dedupeKey: `sub-notify-${transactionId}`,
    });
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Server-side verification entry point
// ---------------------------------------------------------------------------

/**
 * Verify a pending transaction against the provider and apply it when the
 * provider reports success. Safe to call repeatedly — an already-SUCCEEDED
 * transaction returns its result without touching the ledger again.
 */
export async function verifyAndApplyPayment(
  transactionId: string,
  opts: { verifiedById?: string; providerOverride?: PaymentProvider | null }
): Promise<VerifyResult> {
  const tx = await db.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) return { ok: false, error: "Payment transaction not found." };
  if (!tx.providerReference) return { ok: false, error: "This payment has no provider reference." };

  const provider = await resolvePaymentProvider({ providerOverride: opts.providerOverride });
  if (!provider) return { ok: false, error: "The configured payment provider is unavailable." };

  if (tx.status === "SUCCEEDED") {
    return { ok: true, status: "SUCCEEDED", transactionId: tx.id, feePaymentId: tx.feePaymentId ?? undefined };
  }
  if (tx.status === "FAILED") return { ok: true, status: "FAILED", transactionId: tx.id };
  if (tx.status === "EXPIRED") return { ok: true, status: "EXPIRED", transactionId: tx.id };

  const status = await provider.getStatus(tx.providerReference);

  if (status.status === "PENDING") {
    return { ok: true, status: "PENDING", transactionId: tx.id };
  }

  if (status.status === "FAILED") {
    const failed = await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: status.failureReason ?? "Payment failed." },
    });
    await createAuditLog({
      schoolId: tx.schoolId,
      actorId: opts.verifiedById ?? tx.initiatedById ?? "",
      action: "PAYMENT_FAILED",
      entity: "PaymentTransaction",
      entityId: tx.id,
      metadata: { provider: tx.provider, providerReference: tx.providerReference ?? null, failureReason: failed.failureReason },
    });
    return { ok: true, status: "FAILED", transactionId: tx.id };
  }

  const apply = tx.purpose === "FEE_PAYMENT"
    ? await applyFeePayment(tx, status.providerEventId ?? null, opts.verifiedById ?? null)
    : await applySubscriptionPayment(tx, status.providerEventId ?? null, opts.verifiedById ?? null);

  if (!apply.applied) {
    const reason = apply.reason;
    await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: reason },
    });
    await createAuditLog({
      schoolId: tx.schoolId,
      actorId: opts.verifiedById ?? tx.initiatedById ?? "",
      action: "PAYMENT_FAILED",
      entity: "PaymentTransaction",
      entityId: tx.id,
      metadata: { provider: tx.provider, providerReference: tx.providerReference ?? null, failureReason: reason },
    });
    return { ok: true, status: "FAILED", transactionId: tx.id };
  }

  return {
    ok: true,
    status: "SUCCEEDED",
    transactionId: tx.id,
    feePaymentId: apply.feePaymentId ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Webhook processing
// ---------------------------------------------------------------------------

type WebhookRequest = {
  providerName: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  payload: Record<string, unknown>;
  providerOverride?: PaymentProvider | null;
  secretOverride?: string | null;
};

/**
 * Process a verified provider webhook end-to-end:
 *  1. signature verification (401 on failure, nothing persisted),
 *  2. transaction lookup + tenant/amount cross-checks (payload hints are
 *     cross-checked against the authoritative stored transaction),
 *  3. idempotency via the (provider, providerEventId) unique pair — a replay
 *     is recorded once and then ignored,
 *  4. server-verified application.
 * Returns a provider-facing HTTP code plus a safe note.
 */
export async function processProviderWebhook(input: WebhookRequest): Promise<WebhookProcessResult> {
  const provider = await resolvePaymentProvider({
    providerOverride: input.providerOverride,
    secretOverride: input.secretOverride,
  });
  if (!provider || provider.name !== input.providerName) {
    return { code: 501, status: "FAILED", note: "Payment provider is not configured." };
  }

  const signature = pickHeader(input.headers, provider.name);
  const verified = provider.verifyWebhookSignature(input.rawBody, signature);
  if (!verified.ok) {
    return { code: 401, status: "FAILED", note: verified.reason };
  }

  let event;
  try {
    event = provider.parseWebhookEvent(input.payload);
  } catch {
    return { code: 400, status: "FAILED", note: "Unparseable webhook payload." };
  }
  if (!event.providerEventId) {
    return { code: 400, status: "FAILED", note: "Webhook payload has no event id." };
  }

  const reference = event.transactionRef;
  if (!reference) {
    return { code: 400, status: "FAILED", note: "Webhook payload has no transaction reference." };
  }
  const tx = await db.paymentTransaction.findUnique({
    where: { providerReference: reference },
  });
  if (!tx) {
    return { code: 400, status: "FAILED", note: "Unknown transaction reference." };
  }

  // Tenant isolation + money safety: never trust client-supplied identifiers.
  if (event.schoolRef && event.schoolRef !== tx.schoolId) {
    return { code: 403, status: "FAILED", note: "School does not match the recorded transaction." };
  }
  if (event.amountMinor !== undefined && event.amountMinor !== txAmountMinor(tx.amount)) {
    return { code: 400, status: "FAILED", note: "Amount does not match the recorded transaction." };
  }
  if (event.currency && event.currency !== tx.currency) {
    return { code: 400, status: "FAILED", note: "Currency does not match the recorded transaction." };
  }

  // Idempotency: unique (provider, providerEventId). A duplicate delivery is
  // recorded once and reported as IGNORED so no money movement repeats.
  let webhookRow: { id: string } | null = null;
  try {
    webhookRow = await db.webhookEvent.create({
      data: {
        provider: provider.name,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        payload: input.payload as PrismaTypes.InputJsonValue,
        transactionId: tx.id,
      },
    });
  } catch (e) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === "P2002") {
      return { code: 200, status: "IGNORED", note: "Duplicate webhook; already received.", eventId: event.providerEventId };
    }
    return { code: 500, status: "FAILED", note: "Could not record the webhook event." };
  }

  const mark = (status: "PROCESSED" | "IGNORED" | "FAILED", note: string) =>
    db.webhookEvent
      .update({
        where: { id: webhookRow.id },
        data: {
          status,
          processingNote: note,
          processedAt: status === "PROCESSED" ? new Date() : undefined,
        },
      })
      .then(() => undefined)
      .catch(() => undefined);

  await createAuditLog({
    schoolId: tx.schoolId,
    actorId: tx.initiatedById ?? "",
    action: "WEBHOOK_RECEIVED",
    entity: "WebhookEvent",
    entityId: webhookRow.id,
    metadata: {
      provider: provider.name,
      eventType: event.eventType,
      providerEventId: event.providerEventId,
      purpose: tx.purpose,
    },
  });

  if (event.status !== "SUCCEEDED") {
    await mark("IGNORED", event.status === "FAILED" ? "Provider reported a failed payment." : "Provider payment still pending.");
    return { code: 200, status: "IGNORED", note: "Provider did not report success; nothing applied.", eventId: event.providerEventId };
  }

  if (tx.status !== "PENDING") {
    await mark("PROCESSED", `Payment transaction already ${tx.status.toLowerCase()}; nothing applied.`);
    return { code: 200, status: "PROCESSED", note: `Transaction already ${tx.status.toLowerCase()}; nothing reapplied.`, eventId: event.providerEventId };
  }

  const apply =
    tx.purpose === "FEE_PAYMENT"
      ? await applyFeePayment(tx, event.providerEventId, null)
      : tx.purpose === "SUBSCRIPTION"
        ? await applySubscriptionPayment(tx, event.providerEventId, null)
        : null;

  if (!apply) {
    await mark("FAILED", "Unsupported payment purpose.");
    return { code: 500, status: "FAILED", note: "Unsupported payment purpose.", eventId: event.providerEventId };
  }

  if (!apply.applied) {
    const reason = apply.reason;
    await db.paymentTransaction.update({
      where: { id: tx.id },
      data: { status: "FAILED", failedAt: new Date(), failureReason: reason },
    });
    await createAuditLog({
      schoolId: tx.schoolId,
      actorId: tx.initiatedById ?? "",
      action: "PAYMENT_FAILED",
      entity: "PaymentTransaction",
      entityId: tx.id,
      metadata: { provider: tx.provider, providerReference: tx.providerReference ?? null, failureReason: reason },
    });
    await mark("FAILED", reason);
    return { code: 400, status: "FAILED", note: reason, eventId: event.providerEventId };
  }

  await mark("PROCESSED", "Applied successfully.");
  return { code: 200, status: "PROCESSED", note: "Applied successfully.", eventId: event.providerEventId };
}

/** Pick the provider's signature header from an incoming header map. */
function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  providerName: string
): string | null {
  const candidates = [`x-${providerName}-signature`, "x-webhook-signature"];
  for (const key of candidates) {
    const raw = headers[key] ?? headers[key.toLowerCase()];
    if (typeof raw === "string" && raw.length > 0) return raw;
    if (Array.isArray(raw) && raw.length > 0) return raw[0];
  }
  return null;
}

// Re-export for callers that need provider types.
export type { PaymentProvider } from "./types";