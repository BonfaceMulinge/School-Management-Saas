"use client";

import { useState } from "react";
import { Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type UploadDialogProps = {
  studentId: string;
  slug: string;
  onSuccess: () => void;
};

export function UploadDialog({ studentId, slug, onSuccess }: UploadDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/${slug}/students/${studentId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const result = await res.json();
      if (result.ok) {
        onSuccess();
        setIsOpen(false);
      } else {
        alert(result.error ?? "Failed to upload document");
      }
    } catch {
      alert("Failed to upload document");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)} className="inline-flex items-center gap-2">
        <Upload className="size-4" aria-hidden="true" />
        Upload document
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Upload document</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="studentId" value={studentId} />
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  name="title"
                  required
                  maxLength={200}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="e.g. Term 1 Report Card"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  name="type"
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Choose type…</option>
                  <option value="REPORT_CARD">Report card</option>
                  <option value="RECEIPT">Receipt</option>
                  <option value="STATEMENT">Statement</option>
                  <option value="CONSENT_FORM">Consent form</option>
                  <option value="MEDICAL">Medical</option>
                  <option value="TRANSCRIPT">Transcript</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">File (PDF, PNG, JPEG, TXT — max 10 MB)</label>
                <input
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description (optional)</label>
                <textarea
                  name="description"
                  maxLength={1000}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
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
                      Uploading…
                    </>
                  ) : (
                    "Upload"
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