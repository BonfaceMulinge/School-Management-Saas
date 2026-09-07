import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { db } from "@/server/db";
import { requirePermission } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { isConversationParticipant } from "@/server/services/communication";
import { Badge } from "@/components/ui/badge";
import { conversationKindLabel } from "@/lib/communication";
import { formatDateTime, formatTime } from "@/lib/format";
import { ReplyBox, ConversationMarkRead } from "../conversations";

export const metadata: Metadata = {
  title: "Conversation",
};

export default async function ConversationThreadPage(
  props: PageProps<"/[school]/communication/messages/[conversationId]">
) {
  const { school: slug, conversationId } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "communication:view", { next: `/${slug}` });

  const participant = await isConversationParticipant(
    access.schoolId,
    access.user.id,
    conversationId
  );
  if (!participant) notFound();

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId, schoolId: access.schoolId },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      messages: {
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!conversation) notFound();

  const otherNames = conversation.participants
    .filter((p) => p.userId !== access.user.id)
    .map((p) => p.user.name ?? p.user.email ?? "…");

  return (
    <div className="flex flex-col gap-4">
      <ConversationMarkRead slug={slug} conversationId={conversation.id} />

      <div>
        <Link
          href={`/${slug}/communication/messages`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All conversations
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{conversation.subject}</h1>
          <Badge variant="outline">{conversationKindLabel(conversation.kind)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {otherNames.length > 0 ? otherNames.join(", ") : "You"}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-card p-4">
        {conversation.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet — start the conversation below.
          </p>
        ) : (
          conversation.messages.map((m) => {
            const mine = m.senderId === access.user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background"
                  }`}
                >
                  {!mine ? (
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      {m.sender.name ?? "Unknown"}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <div
                    className={`mt-1 text-right text-[11px] ${
                      mine ? "text-primary-foreground/60" : "text-muted-foreground"
                    }`}
                  >
                    {formatDateTimeSep(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <ReplyBox slug={slug} conversationId={conversation.id} />
      </div>
    </div>
  );
}

function formatDateTimeSep(date: Date): string {
  if (date.toDateString() === new Date().toDateString()) {
    return `Today, ${formatTime(date)}`;
  }
  return formatDateTime(date);
}