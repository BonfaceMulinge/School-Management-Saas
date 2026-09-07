"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createSubscriptionAction, listSchoolsForAdmin, listPlansForAdmin } from "@/server/actions/admin";

export function CreateSubscriptionDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState<{
    schoolId: string;
    planId: string;
    status: string;
    startDate: string;
    endDate: string;
    gracePeriodEnd: string;
    paymentRef: string;
    notes: string;
  }>({
    schoolId: "",
    planId: "",
    status: "TRIAL",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    gracePeriodEnd: "",
    paymentRef: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [schools, setSchools] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  const loadData = async () => {
    if (schools.length === 0) {
      const [schoolsData, plansData] = await Promise.all([
        listSchoolsForAdmin().catch(() => []),
        listPlansForAdmin().catch(() => []),
      ]);
      setSchools(schoolsData.map((s) => ({ id: s.id, name: s.name, slug: s.slug })));
      setPlans(plansData.map((p) => ({ id: p.id, name: p.name, slug: p.slug })));
    }
  };

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.schoolId) newErrors.schoolId = "School is required";
    if (!formData.planId) newErrors.planId = "Plan is required";
    if (!formData.startDate) newErrors.startDate = "Start date is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    handleChange(e.target.name, e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setPending(true);
    try {
      const res = await createSubscriptionAction({
        schoolId: formData.schoolId,
        planId: formData.planId,
        status: formData.status,
        startDate: formData.startDate,
        endDate: formData.endDate || null,
        gracePeriodEnd: formData.gracePeriodEnd || null,
        paymentRef: formData.paymentRef || null,
        notes: formData.notes || null,
      });
      if (!res.ok) {
        setErrors({ schoolId: res.error });
        return;
      }
      router.refresh();
      setIsOpen(false);
      setFormData({
        schoolId: "",
        planId: "",
        status: "TRIAL",
        startDate: new Date().toISOString().split("T")[0],
        endDate: "",
        gracePeriodEnd: "",
        paymentRef: "",
        notes: "",
      });
    } catch (err) {
      setErrors({ schoolId: err instanceof Error ? err.message : "Failed to create subscription" });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => { loadData(); setIsOpen(true); }}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        Create Subscription
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Create Subscription</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="schoolId">School</Label>
                <Select value={formData.schoolId} onValueChange={(v) => handleChange("schoolId", v ?? "")} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select school" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.schoolId && <p className="mt-1 text-sm text-destructive">{errors.schoolId}</p>}
              </div>
              <div>
                <Label htmlFor="planId">Plan</Label>
                <Select value={formData.planId} onValueChange={(v) => handleChange("planId", v ?? "")} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.planId && <p className="mt-1 text-sm text-destructive">{errors.planId}</p>}
              </div>
              <div>
                <Label htmlFor="status">Initial Status</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange("status", v ?? "")} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Trial</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  disabled={pending}
                />
                {errors.startDate && <p className="mt-1 text-sm text-destructive">{errors.startDate}</p>}
              </div>
              <div>
                <Label htmlFor="endDate">End Date (optional)</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="gracePeriodEnd">Grace Period End (optional)</Label>
                <Input
                  id="gracePeriodEnd"
                  name="gracePeriodEnd"
                  type="date"
                  value={formData.gracePeriodEnd}
                  onChange={handleInputChange}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="paymentRef">Payment Reference (optional)</Label>
                <Input
                  id="paymentRef"
                  name="paymentRef"
                  value={formData.paymentRef}
                  onChange={handleInputChange}
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  disabled={pending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      Creating…
                    </>
                  ) : (
                    "Create Subscription"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// Icons
import { Plus } from "lucide-react";