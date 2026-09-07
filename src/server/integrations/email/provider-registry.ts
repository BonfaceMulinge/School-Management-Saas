import "server-only";

import { getIntegrationConfig } from "@/server/integrations/config";
import type { EmailProvider } from "./types";

/**
 * Resolve the configured email provider from the platform EMAIL integration
 * config. Real providers (SMTP, Resend, Amazon SES, …) are registered here
 * before being offered in the admin config UI. Until one exists, the channel
 * delivers nothing and outbound records are SKIPPED — delivery is never faked.
 */
export async function resolveEmailProvider(): Promise<EmailProvider | null> {
  const cfg = await getIntegrationConfig("EMAIL");
  if (!cfg.enabled || !cfg.provider) return null;

  switch (cfg.provider) {
    // case "resend": return new ResendProvider({ apiKey: process.env.EMAIL_PROVIDER_KEY });
    // case "smtp":   return new SmtpProvider({ user, pass, host, port });
    default:
      return null;
  }
}