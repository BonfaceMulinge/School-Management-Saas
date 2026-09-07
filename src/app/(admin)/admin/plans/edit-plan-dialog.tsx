"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

import { updatePlanAction } from "@/server/actions/admin";

export type EditablePlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  annualPrice: number;
  isActive: boolean;
  studentLimit: number | null;
  staffLimit: number | null;
  features: unknown;
  notes: string | null;
};

export function EditPlanDialog({ plan }: { plan: EditablePlan }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState({
    name: plan.name,
    slug: plan.slug,
    description: plan.description ?? "",
    annualPrice: plan.annualPrice,
    isActive: plan.isActive,
    studentLimit: plan.studentLimit?.toString() ?? "",
    staffLimit: plan.staffLimit?.toString() ?? "",
    features:
      typeof plan.features === "string"
        ? plan.features
        : JSON.stringify(plan.features ?? {}, null, 2),
    notes: plan.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (name: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => { const n = { ...prev }; delete n[name]; return n; });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.slug.trim()) newErrors.slug = "Slug is required";
    else if (!/^[a-z0-9-]+$/.test(formData.slug)) newErrors.slug = "Slug must be lowercase letters, numbers, and hyphens only";
    if (formData.annualPrice < 0) newErrors.annualPrice = "Price must be non-negative";
    try {
      JSON.parse(formData.features);
    } catch {
      newErrors.features = "Features must be valid JSON";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setPending(true);
    try {
      const res = await updatePlanAction(plan.id, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || undefined,
        annualPrice: formData.annualPrice,
        isActive: formData.isActive,
        studentLimit: formData.studentLimit ? parseInt(formData.studentLimit, 10) : null,
        staffLimit: formData.staffLimit ? parseInt(formData.staffLimit, 10) : null,
        features: JSON.parse(formData.features),
        notes: formData.notes || undefined,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors ? Object.fromEntries(Object.entries(res.fieldErrors).map(([k, v]) => [k, v[0]])) : { name: res.error });
        return;
      }
      window.location.reload();
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : "Failed to update plan" });
    } finally {
      setPending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      handleChange(name, (e.target as HTMLInputElement).checked);
    } else {
      handleChange(name, value);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold">Edit Plan</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Professional"
                  disabled={pending}
                />
                {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  placeholder="e.g. professional"
                  disabled={pending}
                />
                {errors.slug && <p className="mt-1 text-sm text-destructive">{errors.slug}</p>}
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  disabled={pending}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="annualPrice">Annual Price (USD cents)</Label>
                  <Input
                    id="annualPrice"
                    name="annualPrice"
                    type="number"
                    min="0"
                    step="100"
                    value={formData.annualPrice}
                    onChange={handleInputChange}
                    placeholder="e.g. 120000 for $1,200"
                    disabled={pending}
                  />
                  {errors.annualPrice && <p className="mt-1 text-sm text-destructive">{errors.annualPrice}</p>}
                </div>
                <div>
                  <Label htmlFor="isActive">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="isActive"
                        checked={formData.isActive}
                        onCheckedChange={(v) => handleChange("isActive", v)}
                        disabled={pending}
                      />
                      <span className="text-sm font-medium">Active</span>
                    </div>
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="studentLimit">Student Limit (optional)</Label>
                  <Input
                    id="studentLimit"
                    name="studentLimit"
                    type="number"
                    min="1"
                    value={formData.studentLimit}
                    onChange={handleInputChange}
                    placeholder="Unlimited"
                    disabled={pending}
                  />
                </div>
                <div>
                  <Label htmlFor="staffLimit">Staff Limit (optional)</Label>
                  <Input
                    id="staffLimit"
                    name="staffLimit"
                    type="number"
                    min="1"
                    value={formData.staffLimit}
                    onChange={handleInputChange}
                    placeholder="Unlimited"
                    disabled={pending}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="features">Features (JSON)</Label>
                <Textarea
                  id="features"
                  name="features"
                  value={formData.features}
                  onChange={handleInputChange}
                  rows={6}
                  className="font-mono text-sm"
                  disabled={pending}
                />
                {errors.features && <p className="mt-1 text-sm text-destructive">{errors.features}</p>}
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
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
                      Saving…
                    </>
                  ) : (
                    "Save Changes"
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