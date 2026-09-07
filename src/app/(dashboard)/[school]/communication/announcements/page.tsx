import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { visibleAnnouncementsWhere } from "@/server/services/communication";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  audienceLabel,
  announcementStatusLabel,
} from "@/lib/communication";
import { formatDate } from "@/lib/format";
import type { AnnouncementStatus } from "@/generated/prisma/client";
import {
  NewAnnouncementDialog,
  AnnouncementActions,
  type AnnouncementRow,
  type AnnouncementFormData,
} from "./announcements-actions";

export const metadata: Metadata = {
  title: "Announcements",
};

const PAGE_SIZE = 15;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function AnnouncementsPage(
  props: PageProps<"/[school]/communication/announcements">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canManage] = await Promise.all([
    requirePermission(slug, "communication:view", { next: `/${slug}` }),
    canAccess(slug, "communication:manage"),
  ]);

  const q = single(searchParams.q);
  const page = Math.max(1, Number(single(searchParams.page) ?? "1") || 1);
  const tab = (canManage
    ? (single(searchParams.status) as AnnouncementStatus | undefined)
    : undefined) as AnnouncementStatus | undefined;

  const scope = await visibleAnnouncementsWhere(access);
  const where = {
    ...scope,
    ...(tab ? { status: tab } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [classes, people, total, announcements] = await Promise.all([
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: {
        streams: { where: { archived: false }, select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.membership.findMany({
      where: { schoolId: access.schoolId, role: { in: ["PARENT", "TEACHER", "STUDENT"] } },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.announcement.count({ where }),
    db.announcement.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        stream: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        recipients: { select: { userId: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formData: AnnouncementFormData = {
    classes: classes.map((c) => ({ id: c.id, name: c.name, streams: c.streams })),
    people: people.map((m) => ({
      userId: m.user.id,
      label: `${m.user.name ?? m.user.email ?? "Unknown user"} · ${
        m.role === "PARENT" ? "Parent" : m.role === "TEACHER" ? "Teacher" : "Student"
      }`,
    })),
  };

  const queryString = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tab) params.set("status", tab);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const tabs = [
    { value: "", label: "All" },
    { value: "DRAFT", label: "Drafts" },
    { value: "PUBLISHED", label: "Published" },
    { value: "ARCHIVED", label: "Archived" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Announcements"
        description="Broadcast news to parents, teachers or selected people across the school."
        action={
          canManage ? <NewAnnouncementDialog slug={slug} formData={formData} /> : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search announcements…"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        <a
          href={`/${slug}/communication/announcements`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 text-sm">
          {tabs.map((t) => {
            const href = `/${slug}/communication/announcements${queryString(t.value ? { status: t.value } : {})}`;
            const active = (tab ?? "") === t.value;
            return (
              <Link
                key={t.value}
                href={href}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      ) : null}

      {announcements.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <Megaphone className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No announcements</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Create an announcement to start broadcasting to your school."
              : "Nothing has been announced for you yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((a) => {
            const row: AnnouncementRow = {
              id: a.id,
              title: a.title,
              body: a.body,
              audience: a.audience,
              status: a.status,
              classId: a.classId,
              streamId: a.streamId,
              publishAt: a.publishAt ? a.publishAt.toISOString() : null,
              expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
              className: a.class?.name ?? null,
              streamName: a.stream?.name ?? null,
              createdByName: a.createdBy.name ?? null,
              selectedRecipients: a.recipients.map((r) => r.userId),
            };

            return (
              <article
                key={a.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{a.title}</h3>
                    <Badge variant={a.status === "PUBLISHED" ? "default" : "outline"}>
                      {announcementStatusLabel(a.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{audienceLabel(a.audience)}</Badge>
                    {a.class ? (
                      <span>
                        {a.class.name}
                        {a.stream ? ` / ${a.stream.name}` : ""}
                      </span>
                    ) : null}
                    {a.publishAt ? (
                      <span>Published {formatDate(a.publishAt)}</span>
                    ) : (
                      <span>Draft</span>
                    )}
                    {a.createdBy.name ? (
                      <span>by {a.createdBy.name}</span>
                    ) : null}
                    <AnnouncementActions
                      slug={slug}
                      announcement={row}
                      formData={formData}
                      canManage={canManage}
                    />
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                {a.expiresAt ? (
                  <p className="text-xs text-muted-foreground">
                    Visible until {formatDate(a.expiresAt)}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/${slug}/communication/announcements${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/${slug}/communication/announcements${queryString({ page: String(page + 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}