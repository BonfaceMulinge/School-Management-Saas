# Phase 5 — Attendance Management

Status: **Complete** (code) — runtime DB validation pending (see below).

## Data model (`prisma/schema.prisma`)

- `AttendanceStatus` enum: `PRESENT | ABSENT | LATE | EXCUSED`.
- `Attendance` model:
  - `date` stored as `@db.Date` (UTC-normalized day), unique per `(schoolId, studentId, date)` via `@@unique` — one register entry per student per day, upsert-safe.
  - Class/stream/term/academic-year/enrollment are **snapshotted onto the record** at mark time (`classId`, `streamId`, `termId`, `academicYearId`, `enrollmentId`, `recordedById`), so history stays valid even after re-enrollment/transfer.
  - Relations from `Student`, `School`, `User`, `AcademicYear`, `Term`, `Class`, `Stream`, `Enrollment`.
- `AttendanceChange` — immutable audit log of every alteration: old/new status, reason, date, class snapshot, `changedById`. A correction that changes status **requires a reason**; all changes append an entry rather than silently overwriting.

## Authorization (`src/server/authorization.ts`)

- New permission keys: `attendance:view`, `attendance:manage`, `attendance:report`.
- Matrix: SCHOOL_ADMIN/SUPER_ADMIN → view+manage+report; TEACHER → view+manage; STUDENT/PARENT → view only; SUPPORT → view+report.
- All attendance queries and mutations re-derive scope server-side from the authenticated access as described below; client-supplied student/class/stream IDs are never trusted.

## Tenant & role protections (`src/server/services/attendance.ts`)

- `attendanceScopeWhere(access)` returns a Prisma `AttendanceWhereInput`:
  - ADMINS + platform staff → whole school.
  - TEACHER → only their assigned classes/streams (whole-class vs stream-only handling via `TeacherAssignment`), else a `{ id: -1 }` no-match guard.
  - STUDENT → `student.userId = session user id`.
  - PARENT → only attendance of linked students (`guardianRelations`).
- `canManageAttendanceFor(access, classId, streamId)` — teachers cannot mark outside their assignments.
- `teacherAssignmentPairs`, `attendanceRoster`, `dayRange`, `todayDateString` helpers; re-exports `resolveEnrollmentTarget`.

## Server actions (`src/server/actions/attendance.ts`)

- `markAttendance`: validates the user may `attendance:manage`, re-resolves the roster from DB (teachers scoped to assignments), upserts one record per submitted student inside a transaction, and files `AttendanceChange` audit entries whenever an existing status changes. Returns `{ created, updated }`.
- `updateAttendanceRecord`: permission + scope re-check per record, reason required on status change, always appends an `AttendanceChange`.

## Pages

- `/[school]/attendance` — mark screen: date/class/stream/term/status controls (native `<select>` for reliable FormData submission), per-student status pickers, "Mark all present", "not yet recorded" row state for fresh registers; **read-only** register view for non-managers (teachers see only their assigned classes).
- `/[school]/attendance/history` — filters (date/class/term/status) + pagination, scoped to the user; per-row **Correct** dialog (`updateAttendanceRecord`, reason required on status change) shown only to managers; parent/student views are read-only.
- `/[school]/attendance/reports` — daily summary cards, per-class attendance table with roster size + %, 14-day absenteeism trend, student search + pagination + historical totals/correction count; Export button intentionally disabled (planned later phase).
- `/[school]` dashboard — "Today's attendance" stats card (present/absent/late/excused + %) using one `groupBy`, gated by `attendance:view`.
- Sidebar navigation now exposes Attendance / Attendance History / Attendance Reports; loading skeletons added for all three routes.

## Validation

| Check | Result |
| --- | --- |
| `npx prisma validate` | Pass |
| `npx prisma generate` | Pass |
| `npx next typegen` | Pass |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Pass (all attendance routes compile) |

## Remaining issues / blockers

- **Runtime DB testing impossible**: PostgreSQL is not reachable (P1001). Live CRUD for marking, corrections, audit trail, scoped queries, and session auth cannot be executed or verified against a real database. All logic is type-checked/compiled only. When a database becomes available, run a manual pass over: teacher marking scope, parent/student read-only views, duplicate-day upsert, reason-required corrections, and dashboard stats.
- No mock/seed attendance data was added (per project rule against faking data).
- CSV/PDF export of reports deferred.