"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, Trash2 } from "lucide-react";

import { unlinkGuardian } from "@/server/actions/guardians";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { success } from "@/components/ui/use-toast";
import {
  AddGuardianDialog,
  type GuardianStudentRef,
} from "@/components/students/guardians";

type ChildLink = {
  id: string;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
  studentName: string;
};

function ChildUnlink({
  slug,
  link,
  studentName,
}: {
  slug: string;
  link: ChildLink;
  studentName: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <ConfirmDialog
      trigger={
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Unlink ${studentName}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      }
      title="Unlink this child?"
      description={`${studentName} will no longer be linked to this parent. The parent account is kept.`}
      confirmLabel="Unlink"
      destructive
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        const result = await unlinkGuardian(slug, link.id);
        setBusy(false);
        if (result.ok) success({ title: "Child unlinked." });
        else if (result.error)
          success({ title: "Couldn’t unlink", description: result.error });
      }}
    />
  );
}

export function ParentRowActions({
  slug,
  canManage,
  parentId,
  childrenLinks,
  students,
}: {
  slug: string;
  canManage: boolean;
  parentId: string;
  childrenLinks: ChildLink[];
  students: GuardianStudentRef[];
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <AddGuardianDialog
        slug={slug}
        parents={[]}
        students={students}
        guardianUserId={parentId}
      />
      <div className="flex flex-wrap items-center justify-end gap-1">
        {childrenLinks.map((link) => (
          <span key={link.id} className="relative inline-flex">
            <Link
              href={`/${slug}/students/${link.studentId}`}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Eye className="size-3.5" aria-hidden="true" />
              {link.studentName}
            </Link>
            {canManage ? (
              <ChildUnlink slug={slug} link={link} studentName={link.studentName} />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}