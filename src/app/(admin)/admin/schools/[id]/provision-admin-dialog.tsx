"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { provisionSchoolAdminAction } from "@/server/actions/admin";

export function ProvisionAdminDialog({
  schoolId,
  schoolName,
}: {
  schoolId: string;
  schoolName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [formData, setFormData] = useState({ email: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const reset = () => {
    setFormData({ email: "", name: "" });
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
      router.refresh();
      setCredentials(res.data ?? null);
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

      {credentials ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Administrator credentials</h2>
            <p className="mt-2 text-sm text-muted-foreground">Save these credentials now. The temporary password expires in 24 hours.</p>
            <div className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm">
              <p><span className="font-medium">Email:</span> {credentials.email}</p>
              <p className="mt-2"><span className="font-medium">Temporary password:</span> {credentials.temporaryPassword}</p>
            </div>
            <Button className="mt-4" onClick={() => setCredentials(null)}>Done</Button>
          </div>
        </div>
      ) : null}

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
              <p className="text-xs text-muted-foreground">A secure temporary password will be generated and shown once after provisioning.</p>
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