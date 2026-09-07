"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { provisionSchoolAdminAction } from "@/server/actions/admin";

export function ProvisionAdminDialog({
  schoolId,
  schoolName,
  onSuccess,
}: {
  schoolId: string;
  schoolName: string;
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState({ email: "", name: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFormData({ email: "", name: "", password: "" });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await provisionSchoolAdminAction({ schoolId, ...formData });
      if (!res.ok) {
        const first = Object.values(res.fieldErrors ?? {})[0]?.[0];
        setError(first ?? res.error ?? "Failed to provision administrator.");
        return;
      }
      onSuccess();
      setIsOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to provision administrator.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)} disabled={pending}>
        <UserPlus className="mr-2 size-4" aria-hidden="true" />
        Provision admin
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="mb-1 text-lg font-semibold">Provision school administrator</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Grants {schoolName} its SCHOOL_ADMIN member. Uses an existing
              account when the email matches; otherwise creates one. The
              password is only set when the account has none, and it is never
              stored in plain text.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="admin@school.edu"
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="admin-name">Name (optional)</Label>
                <Input
                  id="admin-name"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Jane Doe"
                  disabled={pending}
                />
              </div>
              <div>
                <Label htmlFor="admin-password">Temporary password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                  placeholder="At least 8 characters"
                  disabled={pending}
                />
                {formData.email.trim() && !error && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    If {formData.email.trim()} already has an account, this
                    password is ignored.
                  </p>
                )}
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsOpen(false);
                    reset();
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                      Provisioning…
                    </>
                  ) : (
                    "Provision admin"
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