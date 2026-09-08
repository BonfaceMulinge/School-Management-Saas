"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { createSchoolAction } from "@/server/actions/admin";

export function CreateSchoolDialog() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    timezone: string;
    adminEmail: string;
    adminName: string;
  }>({
    name: "",
    slug: "",
    email: "",
    phone: "",
    address: "",
    currency: "USD",
    timezone: "UTC",
    adminEmail: "",
    adminName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Name is required";
    if (!formData.slug.trim()) newErrors.slug = "Slug is required";
    else if (!/^[a-z0-9-]+$/.test(formData.slug)) newErrors.slug = "Slug must be lowercase letters, numbers, and hyphens only";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email format";
    if (formData.adminEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) newErrors.adminEmail = "Invalid email format";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    handleChange(e.target.name, e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setPending(true);
    try {
      const res = await createSchoolAction(formData);
      if (!res.ok) {
        setErrors(res.fieldErrors ? Object.fromEntries(Object.entries(res.fieldErrors).map(([k, v]) => [k, v[0]])) : { name: res.error });
        return;
      }
      router.refresh();
      setCredentials(res.data?.administrator ?? null);
      setFormData({ name: "", slug: "", email: "", phone: "", address: "", currency: "USD", timezone: "UTC", adminEmail: "", adminName: "" });
    } catch (err) {
      setErrors({ name: err instanceof Error ? err.message : "Failed to create school" });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} disabled={pending}>
        <Plus className="mr-2 size-4" aria-hidden="true" />
        Create School
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">{credentials ? "Administrator credentials" : "Create School"}</h2>
            {credentials ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Save these credentials now. The temporary password is shown only once and expires in 24 hours.
                </p>
                <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
                  <p><span className="font-medium">Email:</span> {credentials.email}</p>
                  <p className="mt-2"><span className="font-medium">Temporary password:</span> {credentials.temporaryPassword}</p>
                </div>
                <Button type="button" onClick={() => { setCredentials(null); setIsOpen(false); }}>
                  Done
                </Button>
              </div>
            ) : <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Springfield High School"
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
                  placeholder="e.g. springfield-high"
                  disabled={pending}
                />
                {errors.slug && <p className="mt-1 text-sm text-destructive">{errors.slug}</p>}
              </div>
              <div>
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="admin@school.edu"
                  disabled={pending}
                />
                {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+1 555 000 0000"
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="address">Address (optional)</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="123 Main St, City, State"
                  disabled={pending}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={formData.currency} onValueChange={(v) => handleChange("currency", v ?? "")} disabled={pending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="KES">KES (KSh)</SelectItem>
                      <SelectItem value="NGN">NGN (₦)</SelectItem>
                      <SelectItem value="ZAR">ZAR (R)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={formData.timezone} onValueChange={(v) => handleChange("timezone", v ?? "")} disabled={pending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT)</SelectItem>
                      <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                      <SelectItem value="Africa/Johannesburg">Africa/Johannesburg (SAST)</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                      <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {errors.name && !formData.name && <p className="text-sm text-destructive">{errors.name}</p>}

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium">
                  First administrator{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                </p>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">A secure temporary password will be generated and shown once after creation.</p>
                <div>
                  <Label htmlFor="adminEmail">Admin email</Label>
                  <Input
                    id="adminEmail"
                    name="adminEmail"
                    type="email"
                    value={formData.adminEmail}
                    onChange={handleInputChange}
                    placeholder="admin@school.edu"
                    disabled={pending}
                  />
                  {errors.adminEmail && <p className="mt-1 text-sm text-destructive">{errors.adminEmail}</p>}
                </div>
                <div className="mt-3">
                  <Label htmlFor="adminName">Admin name (optional)</Label>
                  <Input
                    id="adminName"
                    name="adminName"
                    value={formData.adminName}
                    onChange={handleInputChange}
                    placeholder="e.g. Jane Doe"
                    disabled={pending}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      Uploading…
                    </>
                  ) : (
                    "Create School"
                  )}
                </Button>
              </div>
            </form>}
          </div>
        </div>
      )}
    </>
  );
}

// Icons
import { Plus } from "lucide-react";