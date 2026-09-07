"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, Eye } from "lucide-react";

import { archiveStudent } from "@/server/actions/students";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { success } from "@/components/ui/use-toast";
import {
  EditStudentDialog,
  type StudentDialogData,
} from "@/components/students/edit-student-dialog";

export function StudentRowActions({
  slug,
  student,
  canManage,
}: {
  slug: string;
  student: StudentDialogData;
  canManage: boolean;
}) {
  const [busyArchive, setBusyArchive] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/${slug}/students/${student.id}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Eye className="size-3.5" aria-hidden="true" />
        View
      </Link>
      {canManage ? (
        <>
          <EditStudentDialog student={student} slug={slug} />
          {!student.archived ? (
            <ConfirmDialog
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Archive className="size-4" aria-hidden="true" />
                </Button>
              }
              title="Archive this student?"
              description="Archived students remain in the register but are no longer shown as active registrations and cannot be enrolled or transferred."
              confirmLabel="Archive"
              destructive
              busy={busyArchive}
              onConfirm={async () => {
                setBusyArchive(true);
                const result = await archiveStudent(slug, student.id);
                setBusyArchive(false);
                if (result.ok) success({ title: "Student archived." });
                else if (result.error)
                  success({ title: "Couldn’t archive", description: result.error });
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}