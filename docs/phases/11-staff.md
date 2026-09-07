# Phase 11 — Staff & Teacher Management

## Summary

This phase adds the **staff employment layer** to the school tenant and connects it to the existing teacher-assignment and account/membership systems:

1. **Staff profiles** — a new `Staff` model holds the employment record: staff number, role/category, name, phone, date joined, department, position, and status. Staff are archived (never hard-deleted) to preserve employment history, mirroring the student pattern.
2. **Account & membership management** — staff profiles can be *linked* to a platform `User` (reused by email, never duplicated) plus the correct school `Membership`. Employment roles map to portal roles (`TEACHER` → `TEACHER`, `SCHOOL_ADMIN` → `SCHOOL_ADMIN`, and all other categories → a new minimal `STAFF` role). Accounts are optional — a staff record can be purely an employment record.
3. **Teacher functionality** — reuses the existing `TeacherAssignment` system (no second assignment engine). The Teachers page and staff profile surface each teacher's assignments (subject, class, stream, assigned date) with their actively enrolled students and an assignment/history list; creation/management stays on the existing Teacher Assignments page.
4. **Usage-limit integration** — the Phase 10.5 transactional guard is now wired to staff creation, and the plan's staff limit counts the real `Staff` records (correctly including unlinked staff and all staff categories).
5. **RBAC / tenant security** — new `staff:view` / `staff:manage` capabilities; a `staffScopeWhere` scope keeps teachers/staff to their own profile and parents/students out entirely; every page and mutation re-verifies access server-side. Archived staff lose their linked portal membership.
6. **Audit logging** — `STAFF_CREATE`, `STAFF_UPDATE`, `STAFF_ARCHIVE` entries capture who changed each employment record.

The full validation chain passes. PostgreSQL remains unavailable (P1001) — no runtime DB verification was possible and no fake data was seeded.

---

## Database Changes

### New Enums
```prisma
enum StaffRole {
  TEACHER
  SCHOOL_ADMIN
  ACCOUNTANT
  SUPPORT_STAFF
  OTHER
}

enum StaffStatus {
  ACTIVE
  INACTIVE
}
```

### New Model: `Staff`
```prisma
model Staff {
  id         String     @id @default(cuid())
  schoolId   String
  userId     String?            // optional linked platform User
  role       StaffRole  @default(TEACHER)
  staffNo    String?            // school-assigned staff number
  firstName  String
  middleName String?
  lastName   String
  phone      String?
  dateJoined DateTime?
  department String?
  position   String?
  status     StaffStatus @default(ACTIVE)
  archived   Boolean    @default(false)
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  school School @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  user   User?  @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([schoolId, staffNo])
  @@index([schoolId, archived])
  @@index([schoolId, role])
  @@index([schoolId, status])
  @@index([schoolId, lastName, firstName])
  @@index([schoolId, department])
}
```
Relations added: `School.staff`, `User.staffProfiles`. The staff member's contact email intentionally does **not** live on `Staff` — it lives on the linked `User` (avoiding unnecessary duplication of the User model).

### Extensions to Existing Enums
- `Role` gains **`STAFF`** — the minimal portal role for non-teaching staff (accountant, support staff, other), granting `dashboard:view`, `settings:view`, and (data-scoped) `staff:view`.
- `AuditAction` gains **`STAFF_CREATE`**, **`STAFF_UPDATE`**, **`STAFF_ARCHIVE`**.

---

## Staff Functionality

- **Directory — `/[school]/staff`**: paginated (20/page) table with search (name, staff number, department, position), role and status filters, and an "include archived" toggle. Row actions: View, Edit, Archive (confirmation dialog). School admins see all staff; teachers/staff role members only ever see their own record.
- **Profile — `/[school]/staff/[staffId]`**: identity/employment card, linked-account panel (name, email, verified, portal role), employment-status card, and — for teachers — their teaching assignments with actively enrolled students per assignment.
- **Create / Edit**: dialogs with the full employment form. A "Create login account" / "Linked login account" toggle reveals the email field; the action reuses the existing `User` by email (creating one only when missing) and upserts the matching `Membership`. Server-side zod validation with per-field errors, success toasts, loading states, and an `EmptyState`/dashed empty blocks consistent with the rest of the app.
- **Archive**: sets `archived = true` + `status = INACTIVE`, revokes the matching portal membership (so archived staff can no longer sign in with a staff role), and refuses to archive the **last** active school administrator (checked against both staff records and memberships) to prevent tenant lockout.

## Teacher Functionality

- **Teachers — `/[school]/teachers`**: listing of Teacher-role staff (name, staff number, department, joined date) with their live assignment count, linking to each profile.
- **Staff profile → Teacher assignments**: each assignment shows the subject (code + name), class/stream, assigned date, and the currently ACTIVE enrolled students in that class/stream (chips linking to student profiles). The list doubles as the assignment history since assignments are never deleted.
- Assignment **creation/editing/removal remains exclusively on the existing `/[school]/assignments` page** — no second teacher-assignment system was created.

## User / Membership Changes

- Creating/editing staff with an account toggled on resolves the platform `User` by email (`createParentUser`-style reuse) and upserts the school `Membership`. Employment → portal role mapping:
  - `TEACHER` → `TEACHER`
  - `SCHOOL_ADMIN` → `SCHOOL_ADMIN`
  - `ACCOUNTANT` / `SUPPORT_STAFF` / `OTHER` → `STAFF` (new, minimal role)
- Note: as with guardians, upserting a membership sets the role, so a staff record linked to a user who already holds a *different* school membership will update that membership to the staff-mapped role. This matches the existing parents-module behavior.
- Linked accounts are created without a password (`passwordHash = null`); password provisioning/reset is out of scope for this phase (noted under Remaining Issues).

## Usage-Limit Integration

- `assertUsageCapacityTx(tx, schoolId, "staff")` (Phase 10.5) now counts `Staff` rows where `archived = false AND status = ACTIVE` — the authoritative employment record — instead of the old membership-based proxy. The same definition was applied to `getSubscriptionWithUsage()` (used by admin school detail).
- Staff creation by a school-level user runs **count + insert + membership upsert inside one `Serializable` transaction**; concurrent creates cannot slip past the plan's staff limit. Platform staff (SUPER_ADMIN) bypass the cap, matching student creation. Unlinked staff records count too.
- A duplicate staff number is re-checked and `P2002` is translated to a friendly field error.

## RBAC / Tenant Security

- New capabilities: `staff:view` (School Admins, Teachers for self, SUPPORT for triage), `staff:manage` (School Admins only). SUPER_ADMIN holds everything via `"*"`.
- `staffScopeWhere` guarantees role-scoped data access on *every* staff query: admins/platform see all, teachers/`STAFF` see only their own linked record, parents/students see none (`canViewStaff` re-checks per profile).
- Every server action re-verifies `staff:manage` (`assertPermission`); profile/directory pages use `requirePermission` + `canAccess` + `canViewStaff`. No client-supplied `staffId`/`userId` is trusted.

## Audit Logging

`createAuditLog` records each action: `STAFF_CREATE` (role, staff number, `accountLinked`), `STAFF_UPDATE` (role/staff number/status), `STAFF_ARCHIVE` (role). The admin audit page renders the new action badges.

## Validation Results

| Check | Result |
| --- | --- |
| `prisma validate` | ✅ schema valid |
| `prisma generate` | ✅ client regenerated |
| `next typegen` | ✅ route types generated |
| `tsc --noEmit` | ✅ no errors |
| `npm run lint` | ✅ 0 problems |
| `npm run build` | ✅ 54 routes (incl. `/staff`, `/staff/[staffId]`, `/teachers`) |

## DB / Runtime Limitations

PostgreSQL is still unreachable (P1001) — the build logs the expected `prisma:error` lines during static generation and continues. **No runtime DB verification** (real insert/update/archive, membership upsert, audit write) was possible, and no fake data was seeded. A migration (`prisma migrate dev` / deploy) is still pending DB availability.

## Remaining Issues

- Linked staff accounts are created without a password; staff have no self-service password set or admin reset yet — password provisioning is an auth-phase concern.
- Archiving revokes the staff-mapped portal membership but leaves any *unrelated* membership (e.g. a PARENT role) intact; cross-role edge cases have not been exercised against a real DB.
- The `STAFF` role grants dashboard/settings access to non-teaching staff; finer-grained per-category permissions can be layered on later if the product needs accountants to view finance, etc.
- Membership-only school admins created before Phase 11 are not auto-created as `Staff` records; the staff limit now counts `Staff` records, so legacy memberships alone no longer consume staff capacity.
- No bulk import or payroll/leave/performance modules — deliberately out of scope.