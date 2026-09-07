import type { ReactNode } from "react";

import type { SessionUser } from "@/server/auth";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { visibleDashboardNav } from "@/components/layout/navigation";
import type { PlatformRole, SchoolRole } from "@/lib/permissions";

export function DashboardShell({
  school,
  user,
  roleLabel,
  notificationsUnread,
  schoolRole,
  platformRole,
  children,
}: {
  school: string;
  user: SessionUser;
  roleLabel?: string;
  notificationsUnread?: number;
  schoolRole: SchoolRole | null;
  platformRole: PlatformRole | null;
  children: ReactNode;
}) {
  const navigation = visibleDashboardNav(schoolRole, platformRole);
  const showSettings = navigation.some((item) => item.href === "settings");

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-72 lg:block">
        <Sidebar
          school={school}
          notificationsUnread={notificationsUnread}
          role={schoolRole}
          platformRole={platformRole}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          school={school}
          user={user}
          roleLabel={roleLabel}
          showSettings={showSettings}
          mobileNavItems={navigation}
        />
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}