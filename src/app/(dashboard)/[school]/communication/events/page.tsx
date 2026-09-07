import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { visibleEventsWhere } from "@/server/services/communication";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import {
  audienceLabel,
  eventStatusLabel,
} from "@/lib/communication";
import { formatDateTime } from "@/lib/format";
import type { EventStatus } from "@/generated/prisma/client";
import {
  NewEventDialog,
  EventActions,
  type EventRow,
  type EventFormData,
} from "./events-actions";

export const metadata: Metadata = {
  title: "Events",
};

const PAGE_SIZE = 15;

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function EventsPage(
  props: PageProps<"/[school]/communication/events">
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
  const statusFilter = single(searchParams.status) as EventStatus | undefined;

  const scope = await visibleEventsWhere(access);
  const where = {
    ...scope,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [classes, people, total, events] = await Promise.all([
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
    db.event.count({ where }),
    db.event.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        stream: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        recipients: { select: { userId: true } },
      },
      orderBy: { startsAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formData: EventFormData = {
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
    if (statusFilter) params.set("status", statusFilter);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const filterOptions = [
    { value: "", label: "All events" },
    { value: "SCHEDULED", label: "Upcoming" },
    { value: "COMPLETED", label: "Past" },
    { value: "CANCELLED", label: "Cancelled" },
    { value: "DRAFT", label: "Drafts" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Events"
        description="School events, meetings and activities for parents and staff."
        action={canManage ? <NewEventDialog slug={slug} formData={formData} /> : undefined}
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search events…"
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
          href={`/${slug}/communication/events`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No events found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "Add a school event to keep parents in the loop."
              : "There are no events for you right now."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((e) => {
            const row: EventRow = {
              id: e.id,
              title: e.title,
              description: e.description,
              startsAt: e.startsAt.toISOString(),
              endsAt: e.endsAt ? e.endsAt.toISOString() : null,
              location: e.location,
              audience: e.audience,
              status: e.status,
              classId: e.classId,
              streamId: e.streamId,
              createdByName: e.createdBy.name ?? null,
              selectedRecipients: e.recipients.map((r) => r.userId),
            };
            return (
              <article
                key={e.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{e.title}</h3>
                    <Badge
                      variant={
                        e.status === "CANCELLED"
                          ? "destructive"
                          : e.status === "COMPLETED"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {eventStatusLabel(e.status)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{audienceLabel(e.audience)}</Badge>
                    {e.class ? (
                      <span>
                        {e.class.name}
                        {e.stream ? ` / ${e.stream.name}` : ""}
                      </span>
                    ) : null}
                    <span>{formatDateTime(e.startsAt)}</span>
                    {e.location ? <span>· {e.location}</span> : null}
                    <EventActions
                      slug={slug}
                      event={row}
                      formData={formData}
                      canManage={canManage}
                    />
                  </div>
                </div>
                {e.description ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {e.description}
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
                href={`/${slug}/communication/events${queryString({ page: String(page - 1) })}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/${slug}/communication/events${queryString({ page: String(page + 1) })}`}
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