import type { ReactNode } from "react";

import type { SessionUser } from "@/server/auth";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function DashboardShell({
  school,
  user,
  roleLabel,
  notificationsUnread,
  children,
}: {
  school: string;
  user: SessionUser;
  roleLabel?: string;
  notificationsUnread?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-72 lg:block">
        <Sidebar school={school} notificationsUnread={notificationsUnread} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header school={school} user={user} roleLabel={roleLabel} />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}