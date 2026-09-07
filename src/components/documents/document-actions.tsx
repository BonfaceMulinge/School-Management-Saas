"use client";

import { Trash2, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Doc = {
  id: string;
  title: string;
  storageKey: string | null;
  type: string;
  sizeBytes: number;
};

export function DocumentActions({
  doc,
  slug,
  studentId,
}: {
  doc: Doc;
  slug: string;
  studentId: string;
}) {
  const [pending, setPending] = useState(false);

  const handleDelete = async () => {
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("documentId", doc.id);
      const res = await fetch(`/${slug}/students/${studentId}/documents/delete`, {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.ok) {
        window.location.reload();
      } else {
        alert(result.error ?? "Failed to delete document");
      }
    } catch {
      alert("Failed to delete document");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      {doc.storageKey ? (
        <Button
          render={
            <a
              href={`/${slug}/students/${studentId}/documents/${doc.id}`}
              target="_blank"
              rel="noreferrer"
            />
          }
          variant="ghost"
          size="sm"
        >
          <ExternalLink className="mr-1 size-3.5" aria-hidden="true" />
          Download
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">No file</span>
      )}
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending}
          >
            <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
            Delete
          </Button>
        }
        title="Delete document"
        description={`Permanently remove "${doc.title}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        busy={pending}
      />
    </>
  );
}