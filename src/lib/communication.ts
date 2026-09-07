import type {
  Audience,
  AnnouncementStatus,
  ConversationKind,
  EventStatus,
  NotificationType,
} from "@/generated/prisma/client";

/**
 * Client-safe label helpers for the communication module.
 *
 * NOTE: this file must never import from `@/server/*` — server-only modules
 * drag the Prisma PostgreSQL adapter into the browser bundle and break the
 * Next.js client build. Labels are pure string mappings, nothing more.
 */

export function audienceLabel(audience: Audience): string {
  switch (audience) {
    case "ALL":
      return "Whole school";
    case "PARENTS":
      return "All parents";
    case "TEACHERS":
      return "Teachers";
    case "CLASS":
      return "Class";
    case "STREAM":
      return "Stream";
    case "SELECTED":
      return "Selected people";
  }
}

export function announcementStatusLabel(status: AnnouncementStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PUBLISHED":
      return "Published";
    case "ARCHIVED":
      return "Archived";
  }
}

export function eventStatusLabel(status: EventStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SCHEDULED":
      return "Scheduled";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
  }
}

export function conversationKindLabel(kind: ConversationKind): string {
  switch (kind) {
    case "DIRECT":
      return "Direct";
    case "GROUP":
      return "Group";
    case "SCHOOL_WIDE":
      return "School-wide";
  }
}

export function notificationTypeLabel(type: NotificationType): string {
  switch (type) {
    case "ANNOUNCEMENT":
      return "Announcement";
    case "MESSAGE":
      return "Message";
    case "FEE_PAYMENT":
      return "Fee payment";
    case "FEE_REMINDER":
      return "Fee reminder";
    case "RESULTS_PUBLISHED":
      return "Results published";
    case "ATTENDANCE_ALERT":
      return "Attendance alert";
    case "SCHOOL_EVENT":
      return "School event";
  }
}