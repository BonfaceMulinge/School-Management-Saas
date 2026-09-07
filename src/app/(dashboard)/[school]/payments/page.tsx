import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { listOnlinePayments } from "@/server/actions/payments";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fullName } from "@/lib/students";
import { InitiatePaymentForm, VerifyFeePaymentButton } from "./online-payment-actions";

export const metadata: Metadata = {
  title: "Online Payments",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  EXPIRED: "outline",
};

export default async function OnlinePaymentsPage(props: PageProps<"/[school]/payments">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "finance:view", { next: `/${slug}` }),
    canAccess(slug, "finance:manage"),
  ]);

  const [transactions, students] = await Promise.all([
    listOnlinePayments(slug),
    canManage
      ? db.student.findMany({
          where: { schoolId: access.schoolId, archived: false },
          select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true },
          orderBy: { lastName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online Payments"
        description="Start and verify fee payments handled through the payment provider."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {canManage ? (
          <div className="lg:col-span-1">
            <InitiatePaymentForm
              slug={slug}
              students={students.map((s) => ({
                id: s.id,
                name: fullName(s.firstName, s.middleName, s.lastName),
                studentNo: s.studentNo,
              }))}
              currency={school.currency}
            />
          </div>
        ) : null}

        <div className={canManage ? "lg:col-span-2" : "lg:col-span-3"}>
          {transactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No online payments"
              description="Started fee payments will appear here and can be verified server-side."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                    <th className="px-4 py-3 text-left font-medium">Student</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Reference</th>
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
                        {tx.student ? (
                          <div>
                            <div className="font-medium">
                              {fullName(tx.student.firstName, null, tx.student.lastName)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {tx.student.studentNo ?? "—"}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatMoney(tx.amount.toString(), tx.currency)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {tx.providerReference ?? tx.id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[tx.status] ?? "outline"}>{tx.status}</Badge>
                        {tx.failureReason ? (
                          <div className="mt-1 text-xs text-muted-foreground">{tx.failureReason}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canManage && tx.status === "PENDING" ? (
                          <VerifyFeePaymentButton slug={slug} transactionId={tx.id} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}