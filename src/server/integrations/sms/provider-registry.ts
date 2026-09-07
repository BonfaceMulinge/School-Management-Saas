import "server-only";

import { getIntegrationConfig } from "@/server/integrations/config";
import type { SmsProvider } from "./types";

/**
 * Resolve the configured SMS provider from the platform SMS integration
 * config. Real providers (Twilio, Africa's Talking, …) are registered here
 * before being offered in the admin config UI. Until one exists, the channel
 * delivers nothing and outbound records are SKIPPED.
 */
export async function resolveSmsProvider(): Promise<SmsProvider | null> {
  const cfg = await getIntegrationConfig("SMS");
  if (!cfg.enabled || !cfg.provider) return null;

  switch (cfg.provider) {
    // case "twilio": return new TwilioProvider({ accountSid, authToken });
    default:
      return null;
  }
}