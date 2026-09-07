"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertSuperAdmin } from "@/server/platform-auth";
import {
  listIntegrationConfigs,
  updateIntegrationConfig,
  type IntegrationConfigView,
} from "@/server/integrations/config";
import {
  initiateSubscriptionPayment,
  verifyAndApplyPayment,
} from "@/server/integrations/payments/payment-service";
import { getSubscriptionBySchoolId } from "@/server/services/school-subscriptions";
import { createAuditLog } from "@/server/services/audit-log";
import { makeIdempotencyKey, toMinorUnits } from "@/lib/integrations";
import { fail, ok, type ActionResult } from "@/lib/action-result";

const ALLOWED_PROVIDERS = ["mock"] as const;

const channelSchema = z.enum(["PAYMENT", "EMAIL", "SMS"]);
const modeSchema = z.enum(["SANDBOX", "LIVE"]);

export async function listIntegrationsForAdmin(): Promise<IntegrationConfigView[]> {
  await assertSuperAdmin();
  return listIntegrationConfigs();
}

export async function updateChannelConfigAction(input: FormData): Promise<ActionResult> {
  const access = await assertSuperAdmin();

  const parsed = z
    .object({
      channel: channelSchema,
      provider: z.string().trim(),
      mode: modeSchema,
      enabled: z.string().optional(),
    })
    .safeParse({
      channel: input.get("channel"),
      provider: input.get("provider") ?? "",
      mode: input.get("mode") ?? "SANDBOX",
      enabled: input.get("enabled") ?? "",
    });
  if (!parsed.success) {
    return fail("Invalid configuration values were submitted.");
  }

  const provider = parsed.data.provider || null;
  if (provider && !(ALLOWED_PROVIDERS as readonly string[]).includes(provider)) {
    return fail("That provider is not available yet.");
  }

  await updateIntegrationConfig(parsed.data.channel, {
    provider,
    mode: parsed.data.mode,
    enabled: parsed.data.enabled === "on",
  }, access.user.id);

  await createAuditLog({
    schoolId: null,
    actorId: access.user.id,
    action: "INTEGRATION_CONFIG_CHANGE",
    entity: "IntegrationConfig",
    entityId: parsed.data.channel,
    metadata: {
      channel: parsed.data.channel,
      provider,
      mode: parsed.data.mode,
      enabled: parsed.data.enabled === "on",
    },
  });

  revalidatePath("/admin/integrations");
  return ok();
}

export async function listOutboundMessagesForAdmin(limit = 100) {
  await assertSuperAdmin();
  return db.outboundMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      school: { select: { name: true, slug: true } },
      user: { select: { name: true, email: true } },
    },
  });
}

export async function listPaymentTransactionsForAdmin(limit = 100) {
  await assertSuperAdmin();
  return db.paymentTransaction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      school: { select: { name: true, slug: true } },
      student: { select: { firstName: true, lastName: true, studentNo: true } },
    },
  });
}

export async function initiateSubscriptionPaymentAction(schoolId: string): Promise<
  ActionResult<{
    transactionId: string;
    provider: string;
    providerReference: string | null;
    checkoutUrl: string | null;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";
  }>
> {
  const access = await assertSuperAdmin();

  const sub = await getSubscriptionBySchoolId(schoolId);
  if (!sub) return fail("This school has no subscription to pay for.");
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { currency: true },
  });
  const currency = school?.currency ?? "USD";

  const amountMinor = toMinorUnits(String(sub.plan.annualPrice));
  if (amountMinor <= 0) {
    return fail("This plan has no price to charge.");
  }

  const idempotencyKey = makeIdempotencyKey([
    access.user.id,
    "subscription",
    schoolId,
    sub.planId,
    toMinorUnits(String(sub.plan.annualPrice)),
    new Date().toISOString().slice(0, 10),
  ]);

  const result = await initiateSubscriptionPayment({
    schoolId,
    subscriptionId: sub.id,
    amountMinor,
    currency,
    idempotencyKey,
    initiatedById: access.user.id,
  });

  if (!result.ok) return fail(result.error);
  return ok({
    transactionId: result.transactionId,
    provider: result.provider,
    providerReference: result.providerReference,
    checkoutUrl: result.checkoutUrl,
    status: result.status,
  });
}

export async function verifySubscriptionPaymentAction(
  transactionId: string
): Promise<ActionResult<{ status: "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED" }>> {
  const access = await assertSuperAdmin();
  const result = await verifyAndApplyPayment(transactionId, { verifiedById: access.user.id });
  if (!result.ok) return fail(result.error);

  revalidatePath("/admin/payments");
  return ok({ status: result.status });
}