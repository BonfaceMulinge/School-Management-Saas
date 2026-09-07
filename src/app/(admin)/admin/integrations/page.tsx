import type { Metadata } from "next";
import { CreditCard, Mail, MessageSquareText, ShieldCheck } from "lucide-react";

import { requireSuperAdmin } from "@/server/platform-auth";
import { listIntegrationsForAdmin } from "@/server/actions/integrations";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { IntegrationChannel } from "@/generated/prisma/client";
import { ChannelConfigForm } from "./channel-config-form";

export const metadata: Metadata = {
  title: "Integrations",
};

const CHANNEL_META: Record<
  IntegrationChannel,
  { title: string; description: string; icon: typeof CreditCard }
> = {
  PAYMENT: {
    title: "Payments",
    description: "Online fee and subscription payments. Secrets come from the PAYMENT_PROVIDER_KEY environment variable.",
    icon: CreditCard,
  },
  EMAIL: {
    title: "Email",
    description: "Receipts, reminders and school notices. Secrets come from the EMAIL_PROVIDER_KEY environment variable.",
    icon: Mail,
  },
  SMS: {
    title: "SMS",
    description: "Payment confirmations and reminders. Secrets come from the SMS_PROVIDER_KEY environment variable.",
    icon: MessageSquareText,
  },
};

export default async function AdminIntegrationsPage() {
  await requireSuperAdmin({ next: "/admin" });

  const configs = await listIntegrationsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Configure payment, email and SMS providers. Credentials are never stored in the database."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {configs.map((cfg) => {
          const meta = CHANNEL_META[cfg.channel];
          const Icon = meta.icon;
          return (
            <Card key={cfg.channel}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {meta.title}
                </CardTitle>
                <CardDescription>{meta.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {cfg.enabled && cfg.provider ? (
                    <Badge>Enabled · {cfg.provider}</Badge>
                  ) : (
                    <Badge variant="outline">Disabled</Badge>
                  )}
                  {cfg.secretConfigured ? (
                    <Badge variant="secondary">
                      <ShieldCheck className="mr-1 inline size-3" aria-hidden="true" />
                      Secret present
                    </Badge>
                  ) : (
                    <Badge variant="destructive">No secret in env</Badge>
                  )}
                </div>

                <ChannelConfigForm
                  config={{
                    channel: cfg.channel,
                    provider: cfg.provider,
                    mode: cfg.mode,
                    enabled: cfg.enabled,
                    secretConfigured: cfg.secretConfigured,
                  }}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        A provider must be configured <em>and</em> its secret present in the environment before this channel can
        send anything. Until then, outbound records are marked SKIPPED — delivery is never faked.
      </p>
    </div>
  );
}