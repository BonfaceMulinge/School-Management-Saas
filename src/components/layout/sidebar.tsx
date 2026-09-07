import Link from "next/link";
import { GraduationCap } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { APP_NAME } from "@/lib/constants";
import {
  administrationNav,
  dashboardNav,
  visibleDashboardNav,
  type NavItem,
} from "@/components/layout/navigation";
import type { PlatformRole, SchoolRole } from "@/lib/permissions";

function NavLink({
  item,
  school,
  badge,
}: {
  item: NavItem;
  school: string;
  badge?: number;
}) {
  if (item.disabled) {
    return (
      <span className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/60">
        <item.icon className="size-4 shrink-0" aria-hidden="true" />
        {item.title}
        <Badge
          variant="outline"
          className="ml-auto rounded-full px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
        >
          Soon
        </Badge>
      </span>
    );
  }

  const href = item.href === "" ? `/${school}` : `/${school}/${item.href}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <item.icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{item.title}</span>
      {badge ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({
  school,
  notificationsUnread,
  role,
  platformRole,
}: {
  school: string;
  notificationsUnread?: number;
  role: SchoolRole | null;
  platformRole: PlatformRole | null;
}) {
  const navigation = visibleDashboardNav(role, platformRole);
  const mainNavigation = navigation.filter((item) => dashboardNav.includes(item));
  const adminNavigation = navigation.filter((item) => administrationNav.includes(item));

  return (
    <div className="flex h-full flex-col gap-4 border-r border-border bg-card px-4 py-6">
      <Link href={`/${school}`} className="flex items-center gap-2 px-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-4" aria-hidden="true" />
        </span>
        <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
      </Link>

      <Separator />

      <div className="flex max-h-[calc(100vh-260px)] flex-col gap-6 overflow-y-auto">
        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          {mainNavigation.map((item) => (
            <NavLink
              key={item.title}
              item={item}
              school={school}
              badge={
                item.href === "communication/notifications" && notificationsUnread
                  ? notificationsUnread
                  : undefined
              }
            />
          ))}
        </nav>

        {adminNavigation.length > 0 ? (
          <nav aria-label="Administration navigation" className="flex flex-col gap-1">
            {adminNavigation.map((item) => (
              <NavLink key={item.title} item={item} school={school} />
            ))}
          </nav>
        ) : null}
      </div>

      <div className="mt-auto px-2 text-xs text-muted-foreground">
        <p className="font-medium">v0.1.0</p>
        <p className="mt-0.5">Phase 8 · Communication &amp; Notifications</p>
      </div>
    </div>
  );
}
