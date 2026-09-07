import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { getIntegrationConfig } from "@/server/integrations/config";
import { mergeSchoolSettings } from "@/lib/settings-types";
import { resolveEmailProvider } from "@/server/integrations/email/provider-registry";
import { renderEmail, type EmailTemplateKey } from "@/server/integrations/email/templates";
import { resolveSmsProvider } from "@/server/integrations/sms/provider-registry";
import { renderSms, type SmsTemplateKey } from "@/server/integrations/sms/templates";

/**
 * Outbound messaging (Phase 15): honest delivery records for email/SMS.
 *
 * Every attempt first persists an OutboundMessage row keyed by a unique
 * `dedupeKey`, so retried jobs can never create duplicate messages. Delivery
 * is NEVER faked:
 *   * no provider configured     => message is SKIPPED (never SENT),
 *   * provider send succeeds     => SENT (+ providerReference),
 *   * provider send fails        => FAILED (+ safe errorReason),
 *   * a real (non-mock) provider then needs to be registered in
 *     resolveEmailProvider / resolveSmsProvider before ANY message can be SENT.
 * Production never imports the test log providers.
 */

export type OutboundEmailInput = {
  schoolId: string;
  userId?: string;
  template: string;
  to: string;
  vars: Record<string, string | number>;
  dedupeKey: string;
};

export type OutboundSmsInput = {
  schoolId: string;
  userId?: string;
  template: string;
  toSchoolContact?: boolean;
  phone?: string;
  vars: Record<string, string | number>;
  dedupeKey: string;
};

export type OutboundResult = {
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  messageId: string;
};

async function writeMessage(data: {
  schoolId: string | null;
  userId: string | null;
  channel: "EMAIL" | "SMS";
  template: string;
  recipient: string;
  dedupeKey: string;
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
  provider?: string | null;
  providerReference?: string | null;
  errorReason?: string | null;
}): Promise<OutboundResult> {
  try {
    const row = await db.outboundMessage.create({
      data: {
        schoolId: data.schoolId,
        userId: data.userId,
        channel: data.channel,
        template: data.template,
        recipient: data.recipient,
        dedupeKey: data.dedupeKey,
        status: data.status,
        provider: data.provider ?? null,
        providerReference: data.providerReference ?? null,
        errorReason: data.errorReason ?? null,
        sentAt: data.status === "SENT" ? new Date() : data.status === "PENDING" ? undefined : null,
      },
      select: { id: true, status: true },
    });
    return { status: row.status, messageId: row.id };
  } catch {
    // Unique dedupeKey violation: the retry already has a message row, so we
    // never send a duplicate. Return the existing row's state if it exists.
    const existing = await db.outboundMessage.findUnique({
      where: { dedupeKey: data.dedupeKey },
      select: { id: true, status: true },
    });
    if (existing) return { status: existing.status, messageId: existing.id };
    throw new Error("Could not persist the outbound message.");
  }
}

async function markDelivered(
  id: string,
  status: "SENT" | "FAILED",
  data: { provider: string | null; providerReference?: string | null; errorReason?: string | null }
): Promise<OutboundResult> {
  const row = await db.outboundMessage.update({
    where: { id },
    data: {
      status,
      provider: data.provider,
      providerReference: data.providerReference ?? null,
      errorReason: data.errorReason ?? null,
      sentAt: status === "SENT" ? new Date() : null,
    },
    select: { id: true, status: true },
  });
  return { status: row.status, messageId: row.id };
}

/** Email channel enabled + a provider name configured in DB. */
async function emailChannelEnabled(): Promise<boolean> {
  const cfg = await getIntegrationConfig("EMAIL");
  return cfg.enabled && !!cfg.provider;
}

/** SMS channel enabled + a provider name configured in DB. */
async function smsChannelEnabled(): Promise<boolean> {
  const cfg = await getIntegrationConfig("SMS");
  return cfg.enabled && !!cfg.provider;
}

/** SMS consent: per-event-type NotificationPreferences flags. */
async function smsConsentFor(schoolId: string, template: string): Promise<boolean> {
  const settings = await db.schoolSettings.findUnique({
    where: { schoolId },
  });
  const prefs = mergeSchoolSettings(
    settings
      ? {
          dateFormat: settings.dateFormat,
          timeFormat: settings.timeFormat,
          firstDayOfWeek: settings.firstDayOfWeek,
          attendanceStatuses: settings.attendanceStatuses,
          gradingPreferences: settings.gradingPreferences,
          receiptNumbering: settings.receiptNumbering,
          defaultAcademicSettings: settings.defaultAcademicSettings,
          notificationPreferences: settings.notificationPreferences,
          communicationPreferences: settings.communicationPreferences,
          financeSettings: settings.financeSettings,
        }
      : null
  ).notificationPreferences;

  switch (template) {
    case "payment-confirmation":
    case "payment-receipt":
      return prefs.feePayment;
    case "fee-reminder":
      return prefs.feeReminder;
    default:
      return true;
  }
}

async function resolveSmsRecipient(input: OutboundSmsInput): Promise<string | null> {
  if (input.toSchoolContact) {
    const school = await db.school.findUnique({
      where: { id: input.schoolId },
      select: { phone: true },
    });
    if (school?.phone) return school.phone;
    return null;
  }
  if (input.phone) return input.phone;
  if (input.userId) {
    const staff = await db.staff.findFirst({
      where: { schoolId: input.schoolId, userId: input.userId },
      select: { phone: true },
    });
    if (staff?.phone) return staff.phone;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export async function sendOutboundEmail(input: OutboundEmailInput): Promise<OutboundResult> {
  if (input.to.length === 0) {
    return writeMessage({
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      channel: "EMAIL",
      template: input.template,
      recipient: input.to,
      dedupeKey: input.dedupeKey,
      status: "SKIPPED",
      errorReason: "No recipient address.",
    });
  }

  if (!(await emailChannelEnabled())) {
    return writeMessage({
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      channel: "EMAIL",
      template: input.template,
      recipient: input.to,
      dedupeKey: input.dedupeKey,
      status: "SKIPPED",
      errorReason: "No email provider is configured.",
    });
  }

  const confirmed = await writeMessage({
    schoolId: input.schoolId,
    userId: input.userId ?? null,
    channel: "EMAIL",
    template: input.template,
    recipient: input.to,
    dedupeKey: input.dedupeKey,
    status: "PENDING",
  });
  if (confirmed.status !== "PENDING") return confirmed;

  const provider = await resolveEmailProvider();
  if (!provider) {
    return markDelivered(confirmed.messageId, "FAILED", {
      provider: null,
      errorReason: "No email provider is wired for this build.",
    });
  }

  const rendered = renderEmail(input.template as EmailTemplateKey, input.vars);
  if (!rendered.ok) {
    return markDelivered(confirmed.messageId, "FAILED", {
      provider: provider.name,
      errorReason: "Email template is missing required variables.",
    });
  }

  try {
    const result = await provider.send({
      recipient: input.to,
      subject: rendered.template.subject,
      html: rendered.template.html,
      text: rendered.template.text,
    });
    return markDelivered(confirmed.messageId, "SENT", {
      provider: provider.name,
      providerReference: result.providerReference ?? null,
    });
  } catch {
    return markDelivered(confirmed.messageId, "FAILED", {
      provider: provider.name,
      errorReason: "Provider send failed.",
    });
  }
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

export async function sendOutboundSms(input: OutboundSmsInput): Promise<OutboundResult> {
  const recipient = await resolveSmsRecipient(input);
  if (!recipient) {
    return writeMessage({
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      channel: "SMS",
      template: input.template,
      recipient: input.toSchoolContact ? "school-contact (no phone)" : input.phone ?? "no-phone",
      dedupeKey: input.dedupeKey,
      status: "SKIPPED",
      errorReason: "No phone number available for this recipient.",
    });
  }

  if (!(await smsChannelEnabled())) {
    return writeMessage({
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      channel: "SMS",
      template: input.template,
      recipient,
      dedupeKey: input.dedupeKey,
      status: "SKIPPED",
      errorReason: "No SMS provider is configured.",
    });
  }

  if (!(await smsConsentFor(input.schoolId, input.template))) {
    return writeMessage({
      schoolId: input.schoolId,
      userId: input.userId ?? null,
      channel: "SMS",
      template: input.template,
      recipient,
      dedupeKey: input.dedupeKey,
      status: "SKIPPED",
      errorReason: "SMS disabled for this message type in school settings.",
    });
  }

  const confirmed = await writeMessage({
    schoolId: input.schoolId,
    userId: input.userId ?? null,
    channel: "SMS",
    template: input.template,
    recipient,
    dedupeKey: input.dedupeKey,
    status: "PENDING",
  });
  if (confirmed.status !== "PENDING") return confirmed;

  const provider = await resolveSmsProvider();
  if (!provider) {
    return markDelivered(confirmed.messageId, "FAILED", {
      provider: null,
      errorReason: "No SMS provider is wired for this build.",
    });
  }

  const body = renderSms(input.template as SmsTemplateKey, input.vars);

  try {
    const result = await provider.send({
      recipient,
      body,
    });
    return markDelivered(confirmed.messageId, "SENT", {
      provider: provider.name,
      providerReference: result.providerReference ?? null,
    });
  } catch {
    return markDelivered(confirmed.messageId, "FAILED", {
      provider: provider.name,
      errorReason: "Provider send failed.",
    });
  }
}

/** Re-exported for callers that need the row type for listing. */
export function outboundWhere(input?: {
  schoolId?: string;
  channel?: "EMAIL" | "SMS";
  status?: "PENDING" | "SENT" | "FAILED" | "SKIPPED";
}): Prisma.OutboundMessageWhereInput {
  return {
    ...(input?.schoolId ? { schoolId: input.schoolId } : {}),
    ...(input?.channel ? { channel: input.channel } : {}),
    ...(input?.status ? { status: input.status } : {}),
  };
}