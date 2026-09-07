import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { conversationScopeWhere } from "@/server/services/communication";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { conversationKindLabel } from "@/lib/communication";
import { formatDateTime } from "@/lib/format";
import { NewConversationDialog, type ConversationFormData } from "./conversations";

export const metadata: Metadata = {
  title: "Messages",
};

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export default async function MessagesPage(
  props: PageProps<"/[school]/communication/messages">
) {
  const { school: slug } = await props.params;
  const searchParams = await props.searchParams;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canSend] = await Promise.all([
    requirePermission(slug, "communication:view", { next: `/${slug}` }),
    canAccess(slug, "communication:send"),
  ]);

  const canSchoolWide = await canAccess(slug, "communication:manage");

  const q = single(searchParams.q);

  const scopeWhere = await conversationScopeWhere(access.schoolId, access.user.id);

  const [myParticipants, conversations] = await Promise.all([
    db.conversationParticipant.findMany({
      where: { userId: access.user.id },
      select: { conversationId: true, lastReadAt: true },
    }),
    db.conversation.findMany({
      where: { ...scopeWhere, ...(q ? { subject: { contains: q, mode: "insensitive" as const } } : {}) },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, senderId: true, createdAt: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    }),
  ]);

  const readMap = new Map(
    myParticipants.map((p) => [p.conversationId, p.lastReadAt])
  );

  const [people, students, classes] = await Promise.all([
    db.membership.findMany({
      where: { schoolId: access.schoolId, role: { in: ["PARENT", "TEACHER"] } },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.student.findMany({
      where: { schoolId: access.schoolId, archived: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        enrollments: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: { class: { select: { name: true } } },
        },
      },
      orderBy: { lastName: "asc" },
    }),
    db.class.findMany({
      where: { schoolId: access.schoolId, archived: false },
      include: {
        streams: { where: { archived: false }, select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const formData: ConversationFormData = {
    people: people.map((m) => ({
      id: m.user.id,
      label: m.user.name ?? m.user.email ?? "Unknown user",
    })),
    students: students.map((s) => ({
      id: s.id,
      label: `${s.firstName} ${s.lastName}${
        s.enrollments[0] ? ` · ${s.enrollments[0].class.name}` : ""
      }`,
    })),
    classes: classes.map((c) => ({ id: c.id, name: c.name, streams: c.streams })),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Messages"
        description="In-app conversations with parents and staff."
        action={
          canSend ? (
            <NewConversationDialog slug={slug} formData={formData} canSchoolWide={canSchoolWide} />
          ) : undefined
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex min-w-40 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search conversations…"
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
          href={`/${slug}/communication/messages`}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium leading-9 text-muted-foreground hover:bg-muted"
        >
          Reset
        </a>
      </form>

      {conversations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <MessageSquare className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-medium">No conversations</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a conversation with a parent or a class group to reach out.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const last = c.messages[0];
              const lastReadAt = readMap.get(c.id) ?? null;
              const hasUnread =
                !!last &&
                last.senderId !== access.user.id &&
                (lastReadAt ? last.createdAt > lastReadAt : true);

              const otherNames = c.participants
                .filter((p) => p.userId !== access.user.id)
                .map((p) => p.user.name ?? p.user.email ?? "…");

              return (
                <li key={c.id}>
                  <Link
                    href={`/${slug}/communication/messages/${c.id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">
                          {c.subject}
                        </span>
                        <Badge variant="outline">{conversationKindLabel(c.kind)}</Badge>
                        {hasUnread ? (
                          <span
                            className="size-2 rounded-full bg-primary"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {otherNames.length > 0
                            ? otherNames.join(", ")
                            : "You"}
                        </span>
                        {last ? (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-52">
                              {last.senderId === access.user.id ? "You: " : ""}
                              {last.body}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {c.lastMessageAt ? formatDateTime(c.lastMessageAt) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}