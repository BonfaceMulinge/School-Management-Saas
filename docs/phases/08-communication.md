# Phase 8 — Communication & Notifications

## Scope
Announcements, in-app messaging, notifications, and events/calendar for each tenant school.

## Database additions
`Announcement`, `AnnouncementRecipient`, `Event`, `EventRecipient`, `Conversation`, `ConversationParticipant`, `Message`, `Notification`. Enums: `Audience` (`ALL | PARENTS | TEACHERS | CLASS | STREAM | SELECTED`), `AnnouncementStatus` (`DRAFT | PUBLISHED | ARCHIVED`), `EventStatus` (`DRAFT | SCHEDULED | COMPLETED | CANCELLED`), `ConversationKind` (`DIRECT | GROUP | SCHOOL_WIDE`), `NotificationType`.

## RBAC
Permissions: `communication:view`, `communication:send`, `communication:manage`.

| Audience | view | send | manage |
|---|---|---|---|
| SUPER_ADMIN | * | * | * |
| SCHOOL_ADMIN | ✅ | ✅ | ✅ |
| TEACHER | ✅ | ✅ | — |
| STUDENT | ✅ | — | — |
| PARENT | ✅ | — | — |
| SUPPORT | ✅ | — | — |

## Service logic
- Announcement/event visibility computed from role and ACTIVE student enrollments + Guardian links; SELECTED audience uses materialized recipient rows.
- `notifyUsers` fans out to resolved recipients excluding the creator, deduping by (schoolId, userId, type, title, message, link).
- Conversation unread badge uses `ConversationParticipant.lastReadAt`.
- Notifications unread badge uses `Notification.readAt`.

## Notification wiring
| Event | Type | Trigger |
|---|---|---|
| Announcement published | ANNOUNCEMENT | `publishAnnouncement` / create with publish-now |
| Event scheduled | SCHOOL_EVENT | create with SCHEDULED, or transition to SCHEDULED |
| Conversation created | MESSAGE | first message only |
| Payment recorded | FEE_PAYMENT | `recordPayment` hook |
| Attendance marked ABSENT | ATTENDANCE_ALERT | `markAttendance` hook |

Reserved but not wired: `FEE_REMINDER`, `RESULTS_PUBLISHED` (documented for later).

## Validation
| Step | Result |
|---|---|
| `npx prisma validate` | ✅ |
| `npx prisma generate` | ✅ |
| `npx next typegen` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ |
| `npm run build` | ✅ |

## DB blocker
PostgreSQL unreachable (P1001) — runtime testing not performed.
