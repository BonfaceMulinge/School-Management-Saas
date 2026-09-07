import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  Bell,
  CalendarDays,
  GraduationCap,
  Megaphone,
  MessageSquare,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  listNotifications,
  unreadNotificationCount,
} from "@/server/services/communication";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { notificationTypeLabel } from "@/lib/communication";
import { formatDateTime } from "@/lib/format";
import type { NotificationType } from "@/generated/prisma/client";
import { MarkReadButton, MarkAllReadButton } from "./notification-actions";

export const metadata: Metadata = {
  title: "Notifications",
};

const TYPE_ICONS: Record<NotificationType, LucideIcon> = {
  ANNOUNCEMENT: Megaphone,
  MESSAGE: MessageSquare,
  FEE_PAYMENT: Banknote,
  FEE_REMINDER: Wallet,
  RESULTS_PUBLISHED: GraduationCap,
  ATTENDANCE_ALERT: UserCheck,
  SCHOOL_EVENT: CalendarDays,
};

export default async function NotificationsPage(
  props: PageProps<"/[school]/communication/notifications">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "communication:view", { next: `/${slug}` });

  const [unread, notifications] = await Promise.all([
    unreadNotificationCount(access.schoolId, access.user.id),
    listNotifications(access.schoolId, access.user.id, 100),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `You have ${unread} unread notification${unread === 1 ? "" : "s"}.`
            : "You’re all caught up."
        }
        action={unread > 0 ? <MarkAllReadButton slug={slug} /> : undefined}
      />

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Bell className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No notifications</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You’ll be notified about announcements, messages, payments and events.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type] ?? Bell;
            const unreadRow = n.readAt === null;
            const inner = (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                      unreadRow ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <Badge variant={unreadRow ? "default" : "outline"}>
                        {notificationTypeLabel(n.type)}
                      </Badge>
                      {unreadRow ? (
                        <span className="size-2 rounded-full bg-primary" aria-label="Unread" />
                      ) : null}
                    </div>
                    {n.message ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </div>
                {unreadRow ? (
                  <div className="shrink-0">
                    <MarkReadButton slug={slug} notificationId={n.id} />
                  </div>
                ) : null}
              </div>
            );
            return (
              <div
                key={n.id}
                className={`rounded-lg border bg-card p-4 ${
                  unreadRow ? "border-primary/40" : "border-border"
                }`}
              >
                {n.link ? (
                  <Link href={n.link} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}