"use client";

import { useState } from "react";

import { setPlatformRoleAction } from "@/server/actions/admin";
import type { PlatformRole } from "@/generated/prisma/client";

type Props = {
  userId: string;
  currentRole: PlatformRole | null;
  isSelf: boolean;
};

export function PlatformUserActions({ userId, currentRole, isSelf }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  const run = async (label: string, role: PlatformRole | null) => {
    setPending(label);
    try {
      const res = await setPlatformRoleAction(userId, role as "SUPER_ADMIN" | "SUPPORT" | null);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      window.location.reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to update platform role");
    } finally {
      setPending(null);
    }
  };

  const actions: Array<{ label: string; role: PlatformRole | null }> =
    currentRole === "SUPER_ADMIN"
      ? [
          { label: "Make Support", role: "SUPPORT" },
          { label: "Remove role", role: null },
        ]
      : currentRole === "SUPPORT"
        ? [
            { label: "Make Super Admin", role: "SUPER_ADMIN" },
            { label: "Remove role", role: null },
          ]
        : [
            { label: "Make Super Admin", role: "SUPER_ADMIN" },
            { label: "Make Support", role: "SUPPORT" },
          ];

  return (
    <div className="flex flex-col items-end gap-1">
      {isSelf && <span className="text-xs text-muted-foreground">This is you</span>}
      <div className="flex items-center justify-end gap-3">
        {actions.map((a) => {
          const dangerous =
            a.role === null || (currentRole === "SUPER_ADMIN" && a.role !== "SUPER_ADMIN");
          return pending === a.label ? (
            <span key={a.label} className="text-sm text-muted-foreground">
              Updating…
            </span>
          ) : (
            <button
              key={a.label}
              type="button"
              onClick={() => run(a.label, a.role)}
              disabled={pending !== null}
              className={`text-sm hover:underline disabled:opacity-50 ${
                dangerous ? "text-destructive" : "text-primary"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}