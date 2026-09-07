import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ReceiptText } from "lucide-react";

import { requireSuperAdmin } from "@/server/platform-auth";
import {
  listPaymentTransactionsForAdmin,
  listOutboundMessagesForAdmin,
} from "@/server/actions/integrations";
import { listSubscriptions } from "@/server/services/school-subscriptions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ChargeSubscriptionButton, VerifyTransactionButton } from "./admin-payment-actions";

export const metadata: Metadata = {
  title: "Payments",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  EXPIRED: "outline",
};

export default async function AdminPaymentsPage() {
  await requireSuperAdmin({ next: "/admin" });

  const [transactions, subscriptions, outbound] = await Promise.all([
    listPaymentTransactionsForAdmin(50),
    listSubscriptions(),
    listOutboundMessagesForAdmin(50),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Payments"
        description="Charge school subscriptions and monitor payment transactions and outbound messages."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Charge a subscription</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">School</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Renews</th>
                <th className="px-4 py-3 text-right font-medium">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/schools/${sub.school.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {sub.school.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{sub.school.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{sub.plan.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatMoney(sub.plan.annualPrice, "USD")}/year
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[sub.status] ?? "outline"}>{sub.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {sub.endDate ? formatDateTime(sub.endDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChargeSubscriptionButton
                      schoolId={sub.schoolId}
                      schoolName={sub.school.name}
                      amountLabel={formatMoney(sub.plan.annualPrice, "USD")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Payment transactions</h2>
        {transactions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payment transactions"
            description="Charges you start will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">School</th>
                  <th className="px-4 py-3 text-left font-medium">For</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Purpose</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{tx.school.name}</div>
                      <div className="text-xs text-muted-foreground">{tx.school.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {tx.purpose === "FEE_PAYMENT" && tx.student
                        ? `${tx.student.firstName} ${tx.student.lastName}`.trim()
                        : "Subscription"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(tx.amount.toString(), tx.currency)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-muted-foreground">{tx.purpose}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[tx.status] ?? "outline"}>{tx.status}</Badge>
                      {tx.providerReference ? (
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {tx.providerReference}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.status === "PENDING" && tx.providerReference ? (
                        <VerifyTransactionButton transactionId={tx.id} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Outbound messages</h2>
        {outbound.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No outbound messages"
            description="Email and SMS delivery attempts will be recorded here."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">School</th>
                  <th className="px-4 py-3 text-left font-medium">Channel</th>
                  <th className="px-4 py-3 text-left font-medium">Template</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {outbound.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {m.school ? (
                        <span className="font-medium">{m.school.name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <Badge variant="secondary">{m.channel}</Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{m.template}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[m.status] ?? "outline"}>{m.status}</Badge>
                      {m.errorReason ? (
                        <div className="mt-1 text-xs text-muted-foreground">{m.errorReason}</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}