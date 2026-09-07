import type { Metadata } from "next";

import { requireSuperAdmin } from "@/server/platform-auth";
import { listPlans } from "@/server/services/subscription-plans";
import { updatePlanAction, deletePlanAction } from "@/server/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { CreatePlanDialog } from "./create-plan-dialog";
import { EditPlanDialog, type EditablePlan } from "./edit-plan-dialog";

export const metadata: Metadata = {
  title: "Subscription Plans",
};

export default async function AdminPlansPage() {
  await requireSuperAdmin({ next: "/admin" });

  const plans = await listPlans(true);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscription Plans"
        description="Create and manage SaaS subscription plans."
        action={<CreatePlanDialog onSuccess={() => window.location.reload()} />}
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No plans yet"
          description="Create your first subscription plan to get started."
          action={<CreatePlanDialog onSuccess={() => window.location.reload()} />}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-left font-medium">Annual Price</th>
                <th className="px-4 py-3 text-left font-medium">Student Limit</th>
                <th className="px-4 py-3 text-left font-medium">Staff Limit</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Subscriptions</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {plans.map((plan) => {
                const editable: EditablePlan = {
                  id: plan.id,
                  name: plan.name,
                  slug: plan.slug,
                  description: plan.description,
                  annualPrice: plan.annualPrice,
                  isActive: plan.isActive,
                  studentLimit: plan.studentLimit,
                  staffLimit: plan.staffLimit,
                  features: plan.features,
                  notes: plan.notes,
                };
                return (
                  <tr key={plan.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.slug}</div>
                    </td>
                    <td className="px-4 py-3">{formatMoney(plan.annualPrice, "USD")} / year</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {plan.studentLimit?.toLocaleString() ?? "Unlimited"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {plan.staffLimit?.toLocaleString() ?? "Unlimited"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={plan.isActive ? "default" : "outline"}>
                        {plan.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm">{plan._count.subscriptions}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <EditPlanDialog plan={editable} />
                        {!plan.isActive && (
                          <form action={async () => {
                            const res = await updatePlanAction(plan.id, { isActive: true });
                            if (res.ok) window.location.reload();
                          }}>
                            <button type="submit" className="text-sm text-primary hover:underline">
                              Activate
                            </button>
                          </form>
                        )}
                        {plan.isActive && plan._count.subscriptions === 0 && (
                          <form action={async () => {
                            const res = await deletePlanAction(plan.id);
                            if (res.ok) window.location.reload();
                          }}>
                            <button type="submit" className="text-sm text-destructive hover:underline">
                              Delete
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Icons
import { Package } from "lucide-react";