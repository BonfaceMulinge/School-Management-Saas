"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import type { SchoolAccess } from "@/server/authorization";
import {
  isConversationParticipant,
  notifyUsers,
  resolveAnnouncementRecipients,
  resolveConversationRecipients,
  resolveEventRecipients,
} from "@/server/services/communication";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type {
  ConversationKind,
  EventStatus,
} from "@/generated/prisma/client";

const audienceEnum = z.enum(["ALL", "PARENTS", "TEACHERS", "CLASS", "STREAM", "SELECTED"]);
const eventStatusEnum = z.enum(["DRAFT", "SCHEDULED", "COMPLETED", "CANCELLED"]);
const conversationKindEnum = z.enum(["DIRECT", "GROUP", "SCHOOL_WIDE"]);

function indexedEntries(input: FormData, prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of input.entries()) {
    if (!key.startsWith(`${prefix}[`)) continue;
    const id = key.slice(prefix.length + 1, -1);
    if (id) map.set(id, String(value));
  }
  return map;
}

function textOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : String(value);
  return text.trim() || null;
}

function revalidateCommunication(slug: string, conversationId?: string) {
  revalidatePath(`/${slug}`);
  revalidatePath(`/${slug}/communication/announcements`);
  revalidatePath(`/${slug}/communication/messages`);
  revalidatePath(`/${slug}/communication/notifications`);
  revalidatePath(`/${slug}/communication/events`);
  if (conversationId) {
    revalidatePath(`/${slug}/communication/messages/${conversationId}`);
  }
}

/** Validate a class/stream combination belongs to the tenant */
async function resolveClassStream(
  schoolId: string,
  classId: string | null,
  streamId: string | null
): Promise<{ classId: string | null; streamId: string | null } | null> {
  if (!classId) return { classId: null, streamId: null };

  const cls = await db.class.findUnique({
    where: { id: classId, schoolId },
    select: { id: true },
  });
  if (!cls) return null;

  const resolvedStreamId = streamId ?? null;
  if (resolvedStreamId) {
    const stream = await db.stream.findUnique({
      where: { id: resolvedStreamId },
      select: { classId: true, class: { select: { schoolId: true } } },
    });
    if (!stream || stream.classId !== classId || stream.class.schoolId !== schoolId) {
      return null;
    }
  }

  return { classId, streamId: resolvedStreamId };
}

/** Resolve the selected user accounts for a SELECTED audience and verify they are members. */
async function resolveSelectedUsers(
  access: SchoolAccess,
  input: FormData
): Promise<string[] | null> {
  const recipients = [...indexedEntries(input, "recipient").values()];
  if (recipients.length === 0) return null;

  const memberships = await db.membership.findMany({
    where: { schoolId: access.schoolId, userId: { in: recipients } },
    select: { userId: true },
  });
  const memberIds = new Set(memberships.map((m) => m.userId));
  if (recipients.some((id) => !memberIds.has(id))) return null;
  return recipients;
}

function parseAnnouncementForm(input: FormData) {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required.").max(200),
      body: z.string().trim().min(1, "Message is required.").max(10000),
      audience: audienceEnum,
      classId: z.string().nullable().optional(),
      streamId: z.string().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
    })
    .safeParse({
      title: input.get("title") ?? "",
      body: input.get("body") ?? "",
      audience: input.get("audience") ?? "",
      classId: input.get("classId") ? String(input.get("classId")) : null,
      streamId: input.get("streamId") ? String(input.get("streamId")) : null,
      expiresAt: input.get("expiresAt") ? String(input.get("expiresAt")) : null,
    });
}

function parseExpiry(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "communication:manage");

  const parsed = parseAnnouncementForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const { title, body, audience, classId, streamId, expiresAt } = parsed.data;

  const target = await resolveClassStream(
    access.schoolId,
    classId ?? null,
    streamId ?? null
  );
  if (!target) return fail("The selected class or stream is invalid.");
  if (audience === "CLASS" && !target.classId) {
    return fail("A class is required for a class-wide announcement.", { audience: ["Pick a class first."] });
  }
  if (audience === "STREAM" && !target.streamId) {
    return fail("A stream is required for a stream-wide announcement.", { audience: ["Pick a stream first."] });
  }

  let recipients: string[] = [];
  if (audience === "SELECTED") {
    const selected = await resolveSelectedUsers(access, input);
    if (!selected || selected.length === 0) {
      return fail("Choose at least one parent or teacher for this announcement.", {
        audience: ["Pick at least one recipient."],
      });
    }
    recipients = selected;
  }

  const publishNow = input.get("publish") === "1";

  const created = await db.$transaction(async (tx) => {
    const announcement = await tx.announcement.create({
      data: {
        schoolId: access.schoolId,
        title,
        body,
        audience,
        status: "DRAFT",
        classId: target.classId,
        streamId: target.streamId,
        publishAt: null,
        expiresAt: parseExpiry(expiresAt ?? null),
        createdById: access.user.id,
      },
      select: { id: true },
    });

    if (recipients.length > 0) {
      await tx.announcementRecipient.createMany({
        data: recipients.map((userId) => ({
          announcementId: announcement.id,
          schoolId: access.schoolId,
          userId,
        })),
      });
    }
    return announcement;
  });

  if (publishNow) {
    await publishAnnouncementRecord(schoolSlug, access, created.id);
  }

  revalidateCommunication(schoolSlug);
  return ok({ id: created.id });
}

export async function updateAnnouncement(
  schoolSlug: string,
  announcementId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");

  const announcement = await db.announcement.findUnique({
    where: { id: announcementId, schoolId: access.schoolId },
    select: { id: true, status: true },
  });
  if (!announcement) return fail("Announcement not found.");
  if (announcement.status !== "DRAFT") {
    return fail("Only draft announcements can be edited.");
  }

  const parsed = parseAnnouncementForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const { title, body, audience, classId, streamId, expiresAt } = parsed.data;

  const target = await resolveClassStream(
    access.schoolId,
    classId ?? null,
    streamId ?? null
  );
  if (!target) return fail("The selected class or stream is invalid.");
  if (audience === "CLASS" && !target.classId) {
    return fail("A class is required for a class-wide announcement.");
  }
  if (audience === "STREAM" && !target.streamId) {
    return fail("A stream is required for a stream-wide announcement.");
  }

  let recipients: string[] = [];
  if (audience === "SELECTED") {
    const selected = await resolveSelectedUsers(access, input);
    if (!selected || selected.length === 0) {
      return fail("Choose at least one parent or teacher for this announcement.");
    }
    recipients = selected;
  }

  await db.$transaction(async (tx) => {
    await tx.announcement.update({
      where: { id: announcement.id },
      data: {
        title,
        body,
        audience,
        classId: target.classId,
        streamId: target.streamId,
        expiresAt: parseExpiry(expiresAt ?? null),
      },
    });
    await tx.announcementRecipient.deleteMany({
      where: { announcementId: announcement.id },
    });
    if (recipients.length > 0) {
      await tx.announcementRecipient.createMany({
        data: recipients.map((userId) => ({
          announcementId: announcement.id,
          schoolId: access.schoolId,
          userId,
        })),
      });
    }
  });

  revalidateCommunication(schoolSlug);
  return ok();
}

async function publishAnnouncementRecord(
  schoolSlug: string,
  access: SchoolAccess,
  announcementId: string
): Promise<void> {
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId, schoolId: access.schoolId },
    include: { recipients: { select: { userId: true } } },
  });
  if (!announcement || announcement.status === "ARCHIVED") return;
  if (announcement.status === "PUBLISHED") return;

  await db.announcement.update({
    where: { id: announcement.id },
    data: { status: "PUBLISHED", publishAt: new Date() },
  });

  const recipientIds = await resolveAnnouncementRecipients(access.schoolId, announcement);
  const recipients = recipientIds.filter((id) => id !== access.user.id);
  await notifyUsers(access.schoolId, recipients, {
    type: "ANNOUNCEMENT",
    title: "New announcement",
    message: announcement.title,
    link: `/${schoolSlug}/communication/announcements#${announcement.id}`,
  });
}

export async function publishAnnouncement(
  schoolSlug: string,
  announcementId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId, schoolId: access.schoolId },
    select: { status: true },
  });
  if (!announcement) return fail("Announcement not found.");
  if (announcement.status === "ARCHIVED") return fail("Archived announcements cannot be published.");
  if (announcement.status === "PUBLISHED") return fail("This announcement is already published.");

  await publishAnnouncementRecord(schoolSlug, access, announcementId);
  revalidateCommunication(schoolSlug);
  return ok();
}

export async function unpublishAnnouncement(
  schoolSlug: string,
  announcementId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId, schoolId: access.schoolId },
    select: { id: true, status: true },
  });
  if (!announcement) return fail("Announcement not found.");
  if (announcement.status !== "PUBLISHED") return fail("Only published announcements can be unpublished.");

  await db.$transaction([
    db.notification.deleteMany({
      where: {
        schoolId: access.schoolId,
        type: "ANNOUNCEMENT",
        link: `/${schoolSlug}/communication/announcements#${announcement.id}`,
      },
    }),
    db.announcement.update({
      where: { id: announcement.id },
      data: { status: "DRAFT", publishAt: null },
    }),
  ]);

  revalidateCommunication(schoolSlug);
  return ok();
}

export async function archiveAnnouncement(
  schoolSlug: string,
  announcementId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");
  const announcement = await db.announcement.findUnique({
    where: { id: announcementId, schoolId: access.schoolId },
    select: { id: true, status: true },
  });
  if (!announcement) return fail("Announcement not found.");
  if (announcement.status === "ARCHIVED") return fail("This announcement is already archived.");

  await db.$transaction([
    db.notification.deleteMany({
      where: {
        schoolId: access.schoolId,
        type: "ANNOUNCEMENT",
        link: `/${schoolSlug}/communication/announcements#${announcement.id}`,
      },
    }),
    db.announcement.update({
      where: { id: announcement.id },
      data: { status: "ARCHIVED", publishAt: null },
    }),
  ]);

  revalidateCommunication(schoolSlug);
  return ok();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function parseEventForm(input: FormData) {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required.").max(200),
      description: z.string().trim().max(2000).nullable().optional(),
      startsAt: z.string().min(1, "Start time is required."),
      endsAt: z.string().nullable().optional(),
      location: z.string().trim().max(200).nullable().optional(),
      audience: audienceEnum,
      classId: z.string().nullable().optional(),
      streamId: z.string().nullable().optional(),
      status: eventStatusEnum.optional(),
    })
    .safeParse({
      title: input.get("title") ?? "",
      description: textOrNull(input.get("description")),
      startsAt: input.get("startsAt") ?? "",
      endsAt: textOrNull(input.get("endsAt")),
      location: textOrNull(input.get("location")),
      audience: input.get("audience") ?? "",
      classId: input.get("classId") ? String(input.get("classId")) : null,
      streamId: input.get("streamId") ? String(input.get("streamId")) : null,
      status: input.get("status") ? String(input.get("status")) : "SCHEDULED",
    });
}

function parseDatetime(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function createEvent(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "communication:manage");

  const parsed = parseEventForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const { title, description, endsAt, location, audience, status } = parsed.data;

  const startsAt = parseDatetime(parsed.data.startsAt);
  if (!startsAt) return fail("Enter a valid start time.", { startsAt: ["Invalid date or time."] });

  let endsAtParsed: Date | null = null;
  if (endsAt) {
    const parsedEnd = parseDatetime(endsAt);
    if (!parsedEnd) return fail("Enter a valid end time.");
    if (parsedEnd <= startsAt) return fail("The end time must be after the start time.");
    endsAtParsed = parsedEnd;
  }

  const target = await resolveClassStream(
    access.schoolId,
    parsed.data.classId ?? null,
    parsed.data.streamId ?? null
  );
  if (!target) return fail("The selected class or stream is invalid.");
  if (audience === "CLASS" && !target.classId) {
    return fail("A class is required for a class-wide event.");
  }
  if (audience === "STREAM" && !target.streamId) {
    return fail("A stream is required for a stream-wide event.");
  }

  let recipients: string[] = [];
  if (audience === "SELECTED") {
    const selected = await resolveSelectedUsers(access, input);
    if (!selected || selected.length === 0) {
      return fail("Choose at least one parent or teacher for this event.");
    }
    recipients = selected;
  }

  const eventStatus: EventStatus = status === "DRAFT" ? "DRAFT" : "SCHEDULED";

  const created = await db.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        schoolId: access.schoolId,
        title,
        description: description ?? null,
        startsAt,
        endsAt: endsAtParsed,
        location: location ?? null,
        audience,
        status: eventStatus,
        classId: target.classId,
        streamId: target.streamId,
        createdById: access.user.id,
      },
      select: { id: true },
    });

    if (recipients.length > 0) {
      await tx.eventRecipient.createMany({
        data: recipients.map((userId) => ({
          eventId: event.id,
          schoolId: access.schoolId,
          userId,
        })),
      });
    }
    return event;
  });

  if (eventStatus === "SCHEDULED") {
    await notifyEventScheduled(schoolSlug, access, created.id);
  }

  revalidateCommunication(schoolSlug);
  return ok({ id: created.id });
}

async function notifyEventScheduled(
  schoolSlug: string,
  access: SchoolAccess,
  eventId: string
): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId, schoolId: access.schoolId },
    include: { recipients: { select: { userId: true } } },
  });
  if (!event) return;

  const recipientIds = await resolveEventRecipients(access.schoolId, event);
  const recipients = recipientIds.filter((id) => id !== access.user.id);
  await notifyUsers(access.schoolId, recipients, {
    type: "SCHOOL_EVENT",
    title: "School event",
    message: event.title,
    link: `/${schoolSlug}/communication/events#${event.id}`,
  });
}

export async function updateEvent(
  schoolSlug: string,
  eventId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");

  const event = await db.event.findUnique({
    where: { id: eventId, schoolId: access.schoolId },
    select: { id: true, status: true },
  });
  if (!event) return fail("Event not found.");
  if (event.status === "CANCELLED") return fail("Cancelled events cannot be edited.");

  const parsed = parseEventForm(input);
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const { title, description, endsAt, location, audience, status } = parsed.data;

  const startsAt = parseDatetime(parsed.data.startsAt);
  if (!startsAt) return fail("Enter a valid start time.");

  let endsAtParsed: Date | null = null;
  if (endsAt) {
    const parsedEnd = parseDatetime(endsAt);
    if (!parsedEnd) return fail("Enter a valid end time.");
    if (parsedEnd <= startsAt) return fail("The end time must be after the start time.");
    endsAtParsed = parsedEnd;
  }

  const target = await resolveClassStream(
    access.schoolId,
    parsed.data.classId ?? null,
    parsed.data.streamId ?? null
  );
  if (!target) return fail("The selected class or stream is invalid.");
  if (audience === "CLASS" && !target.classId) return fail("A class is required for a class-wide event.");
  if (audience === "STREAM" && !target.streamId) return fail("A stream is required for a stream-wide event.");

  let recipients: string[] = [];
  if (audience === "SELECTED") {
    const selected = await resolveSelectedUsers(access, input);
    if (!selected || selected.length === 0) {
      return fail("Choose at least one parent or teacher for this event.");
    }
    recipients = selected;
  }

  const newStatus: EventStatus = status === "DRAFT" ? "DRAFT" : "SCHEDULED";

  await db.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: event.id },
      data: {
        title,
        description: description ?? null,
        startsAt,
        endsAt: endsAtParsed,
        location: location ?? null,
        audience,
        status: newStatus,
        classId: target.classId,
        streamId: target.streamId,
        updatedById: access.user.id,
      },
    });
    await tx.eventRecipient.deleteMany({ where: { eventId: event.id } });
    if (recipients.length > 0) {
      await tx.eventRecipient.createMany({
        data: recipients.map((userId) => ({
          eventId: event.id,
          schoolId: access.schoolId,
          userId,
        })),
      });
    }
  });

  if (event.status !== "SCHEDULED" && newStatus === "SCHEDULED") {
    await notifyEventScheduled(schoolSlug, access, event.id);
  }

  revalidateCommunication(schoolSlug);
  return ok();
}

export async function setEventStatus(
  schoolSlug: string,
  eventId: string,
  status: EventStatus
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:manage");

  const parsed = eventStatusEnum.safeParse(status);
  if (!parsed.success || parsed.data === "DRAFT") {
    return fail("Invalid event status.");
  }

  const event = await db.event.findUnique({
    where: { id: eventId, schoolId: access.schoolId },
    select: { id: true, status: true },
  });
  if (!event) return fail("Event not found.");
  if (event.status === parsed.data) return ok();

  await db.event.update({
    where: { id: event.id },
    data: { status: parsed.data, updatedById: access.user.id },
  });

  if (event.status !== "SCHEDULED" && parsed.data === "SCHEDULED") {
    await notifyEventScheduled(schoolSlug, access, event.id);
  }

  revalidateCommunication(schoolSlug);
  return ok();
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function startConversation(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "communication:send");

  const parsedKind = conversationKindEnum.safeParse(input.get("kind"));
  if (!parsedKind.success) return fail("Choose a conversation type.");
  const kind: ConversationKind = parsedKind.data;

  if (kind === "SCHOOL_WIDE") {
    await assertPermission(schoolSlug, "communication:manage");
  }

  const subject = String(input.get("subject") ?? "").trim();
  if (!subject) return fail("A subject is required.", { subject: ["Add a short subject."] });
  if (subject.length > 160) return fail("Subject is too long.");

  const body = String(input.get("message") ?? "").trim();
  if (!body) return fail("Write a message to start the conversation.", { message: ["Write a message."] });
  if (body.length > 4000) return fail("Message is too long.");

  const opts = {
    userId: input.get("userId") ? String(input.get("userId")) : null,
    studentId: input.get("studentId") ? String(input.get("studentId")) : null,
    classId: input.get("classId") ? String(input.get("classId")) : null,
    streamId: input.get("streamId") ? String(input.get("streamId")) : null,
  };

  const recipients = await resolveConversationRecipients(access.schoolId, kind, opts);
  const others = recipients.filter((id) => id !== access.user.id);
  if (others.length === 0) {
    return fail("No recipients matched — check that the parent/student is linked in this school.");
  }

  let classId: string | null = null;
  let streamId: string | null = null;
  if (kind === "GROUP" && opts.classId && (opts.studentId == null)) {
    const target = await resolveClassStream(access.schoolId, opts.classId, opts.streamId);
    if (!target) return fail("The selected class or stream is invalid.");
    classId = target.classId;
    streamId = target.streamId;
  }

  const created = await db.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        schoolId: access.schoolId,
        kind,
        subject,
        classId,
        streamId,
        createdById: access.user.id,
        participants: {
          create: [
            {
              userId: access.user.id,
              lastReadAt: new Date(),
            },
            ...others.map((userId) => ({ userId })),
          ],
        },
      },
      select: { id: true },
    });

    await tx.message.create({
      data: {
        schoolId: access.schoolId,
        conversationId: conversation.id,
        senderId: access.user.id,
        body,
      },
    });

    return conversation;
  });

  const senderName = access.user.name ?? "A staff member";
  await notifyUsers(access.schoolId, others, {
    type: "MESSAGE",
    title: "New message",
    message: `From ${senderName}: ${body.slice(0, 120)}`,
    link: `/${schoolSlug}/communication/messages/${created.id}`,
  });

  revalidateCommunication(schoolSlug, created.id);
  return ok({ id: created.id });
}

export async function sendMessage(
  schoolSlug: string,
  conversationId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:view");

  const participant = await isConversationParticipant(
    access.schoolId,
    access.user.id,
    conversationId
  );
  if (!participant) return fail("You are not a participant in this conversation.");

  const body = String(input.get("message") ?? "").trim();
  if (!body) return fail("Write a message first.", { message: ["Write a message."] });
  if (body.length > 4000) return fail("Message is too long.");

  await db.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        schoolId: access.schoolId,
        conversationId,
        senderId: access.user.id,
        body,
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  });

  revalidateCommunication(schoolSlug, conversationId);
  return ok();
}

export async function markConversationRead(
  schoolSlug: string,
  conversationId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:view");

  const participant = await isConversationParticipant(
    access.schoolId,
    access.user.id,
    conversationId
  );
  if (!participant) return fail("You are not a participant in this conversation.");

  await db.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId: access.user.id } },
    data: { lastReadAt: new Date() },
  });

  revalidateCommunication(schoolSlug, conversationId);
  return ok();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markNotificationsRead(
  schoolSlug: string,
  notificationIds: string[]
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:view");
  const ids = notificationIds.filter(Boolean);
  if (ids.length === 0) return ok();

  await db.notification.updateMany({
    where: {
      id: { in: ids },
      schoolId: access.schoolId,
      userId: access.user.id,
    },
    data: { readAt: new Date() },
  });

  revalidateCommunication(schoolSlug);
  return ok();
}

export async function markAllNotificationsRead(
  schoolSlug: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "communication:view");

  await db.notification.updateMany({
    where: { schoolId: access.schoolId, userId: access.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidateCommunication(schoolSlug);
  return ok();
}