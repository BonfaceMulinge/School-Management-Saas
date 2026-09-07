import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";

import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import {
  announcementsReport,
  messageActivityReport,
  notificationActivityReport,
} from "@/server/services/reports";
import { PageHeader } from "@/components/ui/page-header";
import { CsvExportButton, PrintButton } from "@/components/ui/export-buttons";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Communication reports",
};

const TABS = [
  { value: "announcements", label: "Announcements" },
  { value: "messages", label: "Message activity" },
  { value: "notifications", label: "Notification activity" },
] as const;

type View = (typeof TABS)[number]["value"];

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  return u.toString();
}

export default async function CommunicationReportsPage(
  props: PageProps<"/[school]/reports/communication">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "communication:view", { next: `/${slug}` });

  const view: View = TABS.some((t) => t.value === single(searchParams.view))
    ? (single(searchParams.view) as View)
    : "announcements";

  const status = single(searchParams.status);
  const from = single(searchParams.from);
  const to = single(searchParams.to);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);

  const tabs = (active: View) =>
    TABS.map((t) => ({
      ...t,
      href: `/${slug}/reports/communication?view=${t.value}`,
      active: t.value === active,
    }));

  const filterBar = (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
      <input type="hidden" name="view" value={view} />
      {view === "announcements" ? (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Status
            <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">All statuses</option>
              {["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input name="from" type="date" defaultValue={from ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input name="to" type="date" defaultValue={to ?? ""} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </label>
        </>
      )}
      <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        Apply
      </button>
      <a
        href={`/${slug}/reports/communication?view=${view}`}
        className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
      >
        Reset
      </a>
    </form>
  );

  const printHeader = (title: string) => (
    <div className="hidden print:block">
      <h1 className="text-lg font-bold">{school.name}</h1>
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  );

  let content: React.ReactNode;
  let csv: { headers: string[]; rows: string[][] } | null = null;

  if (view === "announcements") {
    const report = await announcementsReport(access, { status, page, take: 50 });
    csv = {
      headers: ["Title", "Status", "Audience", "Author", "Published at", "Expires at"],
      rows: report.rows.map((r) => [
        String(r.title),
        String(r.status),
        String(r.audience),
        String(r.authorName),
        String(r.publishedAt ? formatDateTime(r.publishedAt) : ""),
        String(r.expiresAt ? formatDateTime(r.expiresAt) : ""),
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Audience</th>
                <th className="px-4 py-3 text-left font-medium">Author</th>
                <th className="px-4 py-3 text-left font-medium">Published at</th>
                <th className="px-4 py-3 text-left font-medium">Expires at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium">{r.title}</td>
                  <td className="px-4 py-3">{r.status}</td>
                  <td className="px-4 py-3">{r.audience}</td>
                  <td className="px-4 py-3">{r.authorName}</td>
                  <td className="px-4 py-3">{r.publishedAt ? formatDateTime(r.publishedAt) : "—"}</td>
                  <td className="px-4 py-3">{r.expiresAt ? formatDateTime(r.expiresAt) : "—"}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No announcements in the selected scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {report.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {report.page} of {report.totalPages} · {report.total} announcement(s)
            </span>
            <div className="flex items-center gap-2">
              {report.page > 1 ? (
                <a
                  href={`/${slug}/reports/communication?${qs({ view, status, page: String(report.page - 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Previous
                </a>
              ) : null}
              {report.page < report.totalPages ? (
                <a
                  href={`/${slug}/reports/communication?${qs({ view, status, page: String(report.page + 1) })}`}
                  className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
                >
                  Next
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  } else if (view === "messages") {
    const report = await messageActivityReport(access, { from, to, page, take: 50 });
    csv = {
      headers: ["Conversation", "Participants", "Messages", "First message", "Last message"],
      rows: report.rows.map((r) => [
        r.members,
        r.members.split(", ").length.toString(),
        String(r.count),
        r.firstAt ? formatDateTime(r.firstAt) : "",
        r.lastAt ? formatDateTime(r.lastAt) : "",
      ]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Participants</th>
                <th className="px-4 py-3 text-right font-medium">Messages</th>
                <th className="px-4 py-3 text-left font-medium">First message</th>
                <th className="px-4 py-3 text-left font-medium">Last message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.members}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3">{r.firstAt ? formatDateTime(r.firstAt) : ""}</td>
                  <td className="px-4 py-3">{r.lastAt ? formatDateTime(r.lastAt) : ""}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No messages in the selected range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else {
    const report = await notificationActivityReport(access, { from, to });
    csv = {
      headers: ["Type", "Count"],
      rows: report.rows.map((r) => [r.type, String(r.count)]),
    };
    content = (
      <div className="flex flex-col gap-4">
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {report.rows.slice(0, 4).map((r, i) => (
            <div key={i} className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">{r.type}</p>
              <p className="mt-1 text-2xl font-semibold">{r.count}</p>
            </div>
          ))}
          <div className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-semibold">{report.total}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {report.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-3 font-medium">{r.type}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-muted-foreground">
                    No notifications in the selected range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const reportTitle =
    view === "announcements"
      ? "Announcements"
      : view === "messages"
        ? "Message activity"
        : "Notification activity";

  return (
    <div className="flex flex-col gap-6">
      {printHeader(reportTitle)}
      <div className="print:hidden">
        <PageHeader
          title="Communication reports"
          description="Announcement reach, message volume and in-app notification activity."
          action={
            <div className="flex items-center gap-2">
              <PrintButton />
              {csv ? (
                <CsvExportButton
                  filename={`communication-${view}.csv`}
                  headers={csv.headers}
                  rows={csv.rows}
                />
              ) : null}
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 print:hidden">
        {tabs(view).map((t) => (
          <Link
            key={t.value}
            href={t.href}
            className={
              t.active
                ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filterBar}
      {content}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
        <Info className="mt-0.5 size-3.5" aria-hidden="true" />
        Message activity is per conversation within the viewer&apos;s accessible scope. Notifications
        are in-app only (email/SMS not tracked here).
      </p>
    </div>
  );
}