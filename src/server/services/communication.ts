import "server-only";

import { db } from "@/server/db";
import type { SchoolAccess } from "@/server/authorization";
import type {
  Audience,
  ConversationKind,
  NotificationType,
  Prisma,
} from "@/generated/prisma/client";

/**
 * Communication & notifications scope helpers.
 *
 * Every announcement / event / conversation query MUST be combined with the
 * viewer-scoped `where` returned here so parents only ever see content about
 * their own children, students only their own records, and teachers only the
 * classes/streams they teach. Notifications are per-user rows created only by
 * real system events — never fabricated data.
 */

/** Sentinel "no rows" predicate matching nothing. */
const NONE_WHERE = { id: { equals: "__none__" } };

/**
 * Compute the class/stream sets a viewer is allowed to receive CLASS/STREAM
 * targeted communication for: a parent's children's active enrollments, or a
 * teacher's class/stream assignments.
 */
async function viewerClassStreams(access: SchoolAccess): Promise<{
  classIds: Set<string>;
  streamIds: Set<string>;
}> {
  const classIds = new Set<string>();
  const streamIds = new Set<string>();
  const role = access.membership?.role;

  if (role === "PARENT") {
    const guardians = await db.guardian.findMany({
      where: { schoolId: access.schoolId, guardianUserId: access.user.id },
      select: {
        student: {
          select: {
            enrollments: {
              where: { status: "ACTIVE" },
              select: { classId: true, streamId: true },
            },
          },
        },
      },
    });
    for (const g of guardians) {
      for (const e of g.student.enrollments) {
        classIds.add(e.classId);
        if (e.streamId) streamIds.add(e.streamId);
      }
    }
  } else if (role === "TEACHER") {
    const assignments = await db.teacherAssignment.findMany({
      where: { schoolId: access.schoolId, teacherId: access.user.id },
      select: { classId: true, streamId: true },
    });
    for (const a of assignments) {
      classIds.add(a.classId);
      if (a.streamId) streamIds.add(a.streamId);
    }
  }

  return { classIds, streamIds };
}

/**
 * Build the audience OR-branches of a visibility filter for the current
 * viewer. Reality checks are done against the `Announcement`/`Event` field
 * shapes (identical apart from the recipients relation), and each caller
 * narrows to its own model type.
 */
async function buildAudienceOrs(access: SchoolAccess): Promise<
  Array<{
    audience: Audience;
    classId?: { in: string[] };
    streamId?: { in: string[] };
    recipients?: { some: { userId: string } };
  }>
> {
  const { user } = access;
  const role = access.membership?.role;
  const { classIds, streamIds } = await viewerClassStreams(access);

  const ors: Array<{
    audience: Audience;
    classId?: { in: string[] };
    streamId?: { in: string[] };
    recipients?: { some: { userId: string } };
  }> = [];

  if (role === "PARENT" || role === "TEACHER") {
    ors.push({ audience: "ALL" });
    if (role === "PARENT") ors.push({ audience: "PARENTS" });
    if (role === "TEACHER") ors.push({ audience: "TEACHERS" });
    if (classIds.size > 0) {
      ors.push({ audience: "CLASS", classId: { in: [...classIds] } });
    }
    if (streamIds.size > 0) {
      ors.push({ audience: "STREAM", streamId: { in: [...streamIds] } });
    }
    ors.push({ audience: "SELECTED", recipients: { some: { userId: user.id } } });
  } else {
    // STUDENT or unknown membership role.
    ors.push({ audience: "ALL" });
    ors.push({ audience: "SELECTED", recipients: { some: { userId: user.id } } });
  }

  return ors;
}

/**
 * Announcements a viewer may see:
 * - SCHOOL_ADMIN / platform staff: every published post plus their own drafts.
 * - Everyone else: published, not-expired posts matching their audience, plus
 *   their own drafts.
 */
export async function visibleAnnouncementsWhere(
  access: SchoolAccess
): Promise<Prisma.AnnouncementWhereInput> {
  const { user, membership, isPlatformStaff, schoolId } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") {
    return {
      schoolId,
      OR: [
        { status: "PUBLISHED" },
        { status: "DRAFT", createdById: user.id },
      ],
    };
  }

  if (!membership) return { schoolId, AND: [NONE_WHERE] };

  const audienceOrs = await buildAudienceOrs(access);
  const now = new Date();

  return {
    schoolId,
    OR: [
      {
        status: "PUBLISHED",
        AND: [
          { OR: audienceOrs as Prisma.AnnouncementWhereInput[] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      { status: "DRAFT", createdById: user.id },
    ],
  };
}

/**
 * Events a viewer may see:
 * - SCHOOL_ADMIN / platform staff: all events.
 * - Everyone else: non-cancelled events matching their audience.
 */
export async function visibleEventsWhere(
  access: SchoolAccess
): Promise<Prisma.EventWhereInput> {
  const { membership, isPlatformStaff, schoolId } = access;

  if (isPlatformStaff || membership?.role === "SCHOOL_ADMIN") {
    return { schoolId };
  }

  if (!membership) return { schoolId, AND: [NONE_WHERE] };

  const audienceOrs = await buildAudienceOrs(access);

  return {
    schoolId,
    status: { in: ["SCHEDULED", "COMPLETED"] },
    AND: [{ OR: audienceOrs as Prisma.EventWhereInput[] }],
  };
}

// ---------------------------------------------------------------------------
// Recipient resolution (used when publishing announcements, creating events
// and starting conversations, to fan out in-app notifications).
// ---------------------------------------------------------------------------

type AnnouncementRef = {
  audience: Audience;
  classId: string | null;
  streamId: string | null;
  recipients?: { userId: string }[];
};

type EventRef = {
  audience: Audience;
  classId: string | null;
  streamId: string | null;
  recipients?: { userId: string }[];
};

async function resolveAudienceUserIds(
  schoolId: string,
  ref: AnnouncementRef | EventRef
): Promise<string[]> {
  const users = new Set<string>();

  switch (ref.audience) {
    case "ALL": {
      const rows = await db.membership.findMany({
        where: { schoolId },
        select: { userId: true },
      });
      rows.forEach((r) => users.add(r.userId));
      break;
    }
    case "PARENTS": {
      const rows = await db.membership.findMany({
        where: { schoolId, role: "PARENT" },
        select: { userId: true },
      });
      rows.forEach((r) => users.add(r.userId));
      break;
    }
    case "TEACHERS": {
      const rows = await db.membership.findMany({
        where: { schoolId, role: "TEACHER" },
        select: { userId: true },
      });
      rows.forEach((r) => users.add(r.userId));
      break;
    }
    case "CLASS":
    case "STREAM": {
      const enrollments = await db.enrollment.findMany({
        where: {
          schoolId,
          status: "ACTIVE",
          classId: ref.classId ?? undefined,
          streamId: ref.streamId ?? undefined,
        },
        select: { studentId: true },
      });
      if (enrollments.length > 0) {
        const guardians = await db.guardian.findMany({
          where: { schoolId, studentId: { in: enrollments.map((e) => e.studentId) } },
          select: { guardianUserId: true },
        });
        guardians.forEach((g) => users.add(g.guardianUserId));
      }
      break;
    }
    case "SELECTED": {
      (ref.recipients ?? []).forEach((r) => users.add(r.userId));
      break;
    }
  }

  return [...users];
}

export async function resolveAnnouncementRecipients(
  schoolId: string,
  announcement: AnnouncementRef
): Promise<string[]> {
  return resolveAudienceUserIds(schoolId, announcement);
}

export async function resolveEventRecipients(
  schoolId: string,
  event: EventRef
): Promise<string[]> {
  return resolveAudienceUserIds(schoolId, event);
}

/**
 * Resolve the recipient user accounts a new conversation should fan out to,
 * based on its kind:
 * - DIRECT: a specific member (validated below).
 * - GROUP + studentId: the linked guardians of one student.
 * - GROUP + classId: the guardians of students actively enrolled in the
 *   class/stream.
 * - SCHOOL_WIDE: every member of the school.
 */
export async function resolveConversationRecipients(
  schoolId: string,
  kind: ConversationKind,
  opts: {
    userId?: string | null;
    studentId?: string | null;
    classId?: string | null;
    streamId?: string | null;
  }
): Promise<string[]> {
  const users = new Set<string>();

  if (kind === "DIRECT") {
    const target = opts.userId
      ? await db.membership.findFirst({
          where: { schoolId, userId: opts.userId },
          select: { userId: true },
        })
      : null;
    if (target) users.add(target.userId);
  } else if (kind === "GROUP" && opts.studentId) {
    const guardians = await db.guardian.findMany({
      where: { schoolId, studentId: opts.studentId },
      select: { guardianUserId: true },
    });
    guardians.forEach((g) => users.add(g.guardianUserId));
  } else if (kind === "GROUP" && opts.classId) {
    const enrollments = await db.enrollment.findMany({
      where: {
        schoolId,
        status: "ACTIVE",
        classId: opts.classId,
        streamId: opts.streamId ?? undefined,
      },
      select: { studentId: true },
    });
    if (enrollments.length > 0) {
      const guardians = await db.guardian.findMany({
        where: { schoolId, studentId: { in: enrollments.map((e) => e.studentId) } },
        select: { guardianUserId: true },
      });
      guardians.forEach((g) => users.add(g.guardianUserId));
    }
  } else if (kind === "SCHOOL_WIDE") {
    const members = await db.membership.findMany({
      where: { schoolId },
      select: { userId: true },
    });
    members.forEach((m) => users.add(m.userId));
  }

  return [...users];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationInput = {
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
};

/**
 * Create notification rows for a set of users. Duplicates are suppressed when
 * an identical notification (same school, user, type, title, message and link)
 * already exists, so re-publishing or double-submitting never double-notifies.
 */
export async function notifyUsers(
  schoolId: string,
  userIds: string[],
  input: NotificationInput
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;

  const existing = await db.notification.findMany({
    where: {
      schoolId,
      userId: { in: ids },
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      link: input.link ?? null,
    },
    select: { userId: true },
  });
  const seen = new Set(existing.map((e) => e.userId));
  const fresh = ids.filter((id) => !seen.has(id));
  if (fresh.length === 0) return;

  await db.notification.createMany({
    data: fresh.map((userId) => ({
      schoolId,
      userId,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      link: input.link ?? null,
    })),
  });
}

/** Notify the linked guardians of a single student (empty when unlinked). */
export async function notifyGuardiansOfStudent(
  schoolId: string,
  studentId: string,
  input: NotificationInput,
  excludeUserId?: string
): Promise<void> {
  const guardians = await db.guardian.findMany({
    where: { schoolId, studentId },
    select: { guardianUserId: true },
  });
  const userIds = guardians
    .map((g) => g.guardianUserId)
    .filter((id) => id !== excludeUserId);
  await notifyUsers(schoolId, userIds, input);
}

export async function unreadNotificationCount(
  schoolId: string,
  userId: string
): Promise<number> {
  return db.notification.count({
    where: { schoolId, userId, readAt: null },
  });
}

export async function listNotifications(
  schoolId: string,
  userId: string,
  take = 50
) {
  return db.notification.findMany({
    where: { schoolId, userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function conversationScopeWhere(
  schoolId: string,
  userId: string
): Promise<Prisma.ConversationWhereInput> {
  return { schoolId, participants: { some: { userId } } };
}

export async function isConversationParticipant(
  schoolId: string,
  userId: string,
  conversationId: string
): Promise<boolean> {
  const row = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return row !== null;
}

/** True when the viewer may talk to this person (a member of the same school). */
export async function isSchoolMember(
  schoolId: string,
  userId: string
): Promise<boolean> {
  const row = await db.membership.findFirst({
    where: { schoolId, userId },
    select: { id: true },
  });
  return row !== null;
}