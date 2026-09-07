import "server-only";

import { db } from "@/server/db";
import type { IntegrationChannel, ProviderMode } from "@/generated/prisma/client";

/**
 * Platform-level integration configuration (Phase 15).
 *
 * The database row only records the provider NAME, mode and enabled flag —
 * never credentials. Provider secrets are read from environment variables at
 * request time (`*_PROVIDER_KEY`) so they can never end up in the database,
 * the compiled client bundle, or any export.
 */

export type IntegrationConfigView = {
  channel: IntegrationChannel;
  provider: string | null;
  mode: ProviderMode;
  enabled: boolean;
  meta: Record<string, unknown> | null;
  /** Whether this channel's provider secret is present in the environment. */
  secretConfigured: boolean;
  updatedAt: Date | null;
};

const ALL_CHANNELS: IntegrationChannel[] = ["PAYMENT", "EMAIL", "SMS"];

/**
 * Environment variable that supplies the channel's provider credential.
 * Returns null (not configured) when unset. Values are never surfaced.
 */
export function channelSecretEnv(channel: IntegrationChannel): string | null {
  switch (channel) {
    case "PAYMENT":
      return process.env.PAYMENT_PROVIDER_KEY ?? null;
    case "EMAIL":
      return process.env.EMAIL_PROVIDER_KEY ?? null;
    case "SMS":
      return process.env.SMS_PROVIDER_KEY ?? null;
    default:
      return null;
  }
}

/** True when the environment has a credential for the channel. */
export function isSecretConfigured(channel: IntegrationChannel): boolean {
  return channelSecretEnv(channel) !== null;
}

export async function getIntegrationConfig(
  channel: IntegrationChannel
): Promise<IntegrationConfigView> {
  const row = await db.integrationConfig.findUnique({ where: { channel } });
  return {
    channel,
    provider: row?.provider ?? null,
    mode: row?.mode ?? "SANDBOX",
    enabled: row?.enabled ?? false,
    meta: (row?.meta as Record<string, unknown> | null) ?? null,
    secretConfigured: isSecretConfigured(channel),
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function listIntegrationConfigs(): Promise<IntegrationConfigView[]> {
  const rows = await db.integrationConfig.findMany({
    select: { channel: true, provider: true, mode: true, enabled: true, meta: true, updatedAt: true },
  });
  const byChannel = new Map(rows.map((r) => [r.channel, r]));

  return ALL_CHANNELS.map((channel) => {
    const row = byChannel.get(channel);
    return {
      channel,
      provider: row?.provider ?? null,
      mode: row?.mode ?? "SANDBOX",
      enabled: row?.enabled ?? false,
      meta: (row?.meta as Record<string, unknown> | null) ?? null,
      secretConfigured: isSecretConfigured(channel),
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

/** Update a platform channel's configuration. SUPER_ADMIN gate lives in the action. */
export async function updateIntegrationConfig(
  channel: IntegrationChannel,
  data: { provider: string | null; mode: ProviderMode; enabled: boolean },
  updatedById: string
): Promise<IntegrationConfigView> {
  await db.integrationConfig.upsert({
    where: { channel },
    create: {
      channel,
      provider: data.provider,
      mode: data.mode,
      enabled: data.enabled,
      updatedById,
    },
    update: {
      provider: data.provider,
      mode: data.mode,
      enabled: data.enabled,
      updatedById,
    },
  });

  return getIntegrationConfig(channel);
}