# Phase 10 — Super Admin & SaaS Management

## Summary

This phase builds the **platform administration and SaaS subscription layer** on top of the multi-tenant school system: a Super-Admin platform dashboard, school lifecycle management, configurable subscription plans with school subscriptions, a centralized server-side subscription/usage enforcement service, platform-user management, controlled SUPPORT access, an audit-log foundation, and full server-side tenant/security enforcement.

All mutations run through **server actions** that re-verify `SUPER_ADMIN` on the server (never trusting client-supplied roles or actors) and write an **audit-log** entry. No payment provider, SMS, or email integration was added; no fake subscriptions or seeded schools/users were created. PostgreSQL remains unavailable (P1001), so runtime database verification was not possible. The full validation chain passes.

---

## Database Changes

### New Enum: `SchoolStatus`
```prisma
enum SchoolStatus {
  ACTIVE
  SUSPENDED
  ARCHIVED
}
```
Added field: `School.status SchoolStatus @default(ACTIVE)`.

### New Model: `SubscriptionPlan`
```prisma
model SubscriptionPlan {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  annualPrice Int      // in minor units (e.g., USD cents)
  isActive    Boolean  @default(true)
  studentLimit Int?    // null = unlimited
  staffLimit   Int?    // null = unlimited
  features    Json?    // feature flags as JSON object
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById String
  updatedById String
  subscriptions SchoolSubscription[]
  createdBy     User @relation("PlanCreatedBy", ...)
  updatedBy     User @relation("PlanUpdatedBy", ...)
  @@index([isActive])
}
```

### New Enum: `SubscriptionStatus`
```prisma
enum SubscriptionStatus {
  TRIAL
  ACTIVE
  GRACE_PERIOD
  EXPIRED
  SUSPENDED
  CANCELLED
}
```

### New Model: `SchoolSubscription`
```prisma
model SchoolSubscription {
  id             String             @id @default(cuid())
  schoolId       String
  planId         String
  status         SubscriptionStatus @default(TRIAL)
  startDate      DateTime
  endDate        DateTime?
  gracePeriodEnd DateTime?
  cancelledAt    DateTime?
  paymentRef     String?
  notes          String?
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  createdById    String
  updatedById    String
  school         School             @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  plan           SubscriptionPlan   @relation(fields: [planId], references: [id], onDelete: Restrict)
  createdBy      User               @relation("SubscriptionCreatedBy", ...)
  updatedBy      User               @relation("SubscriptionUpdatedBy", ...)
  @@unique([schoolId])              // one active subscription record per school slot
  @@index([schoolId, status])
}
```
Historical subscriptions are preserved (records are never deleted — cancellation flips status and sets `cancelledAt`).

### New Enum: `AuditAction`
```prisma
enum AuditAction {
  SCHOOL_CREATE
  SCHOOL_UPDATE
  SCHOOL_STATUS_CHANGE
  SUBSCRIPTION_CREATE
  SUBSCRIPTION_UPDATE
  SUBSCRIPTION_STATUS_CHANGE
  PLAN_CREATE
  PLAN_UPDATE
  USER_ROLE_CHANGE
  USER_PLATFORM_ROLE_CHANGE
  SETTINGS_CHANGE
  FINANCIAL_ACTION
  DATA_EXPORT
  OTHER
}
```

### New Model: `AuditLog`
```prisma
model AuditLog {
  id        String      @id @default(cuid())
  schoolId  String?
  actorId   String
  action    AuditAction
  entity    String
  entityId  String
  metadata  Json?
  createdAt DateTime    @default(now())
  school    School?     @relation(fields: [schoolId], references: [id], onDelete: SetNull)
  actor     User        @relation(fields: [actorId], references: [id], onDelete: Restrict)
  @@index([schoolId, createdAt])
  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@index([entity, entityId])
}
```
No passwords, session tokens, or secrets are stored.

Relations added: `School.subscriptions`, `School.auditLogs`, and user relations for plan/subscription creation/update and audit entries.

---

## New Permissions

| Permission | Meaning | Granted to |
|------------|---------|------------|
| `admin:schools:view` | View platform schools list/details | SUPER_ADMIN, SUPPORT |
| `admin:schools:manage` | Create/edit/activate/suspend/archive schools | SUPER_ADMIN |
| `admin:subscriptions:view` | View subscriptions | SUPER_ADMIN, SUPPORT |
| `admin:subscriptions:manage` | Create/change/cancel subscriptions | SUPER_ADMIN |
| `admin:plans:view` | View subscription plans | SUPER_ADMIN, SUPPORT |
| `admin:plans:manage` | Create/edit/deactivate/delete plans | SUPER_ADMIN |
| `admin:users:view` | View platform users | SUPER_ADMIN, SUPPORT |
| `admin:users:manage` | Manage platform users | SUPER_ADMIN |
| `admin:audit:view` | View audit log | SUPER_ADMIN, SUPPORT |

`SUPER_ADMIN` carries `"*"` (all permissions); `SUPPORT` is granted the read-only `view` admin permissions only — it never gains default access to private school data (SUPPORT is not in the school role matrix, and `requireSchoolAccess`/`requireRole` do not grant SUPPORT school capabilities).

---

## Platform Authorization (`src/server/platform-auth.ts`)

- `requireSuperAdmin()` / `assertSuperAdmin()` — SUPER_ADMIN-only (redirect vs throw guard).
- `requirePlatformStaff()` / `assertPlatformStaff()` — SUPER_ADMIN or SUPPORT.
- `canAccessPlatform(permission)` — permission check used for SUPPORT's explicit admin grants.
- `isSuperAdmin(userId)` / `isPlatformStaff(userId)` — cross-references.

The `(admin)/layout.tsx` guards every admin page with `requireSuperAdmin`.

---

## Super Admin Dashboard (`/admin`)

Shows: total/active/suspended/archived schools, total students across schools, platform users (super admins + support count), expiring subscriptions (within 30 days), recently created schools, and expiring-subscription list. Data comes from `getSchoolCounts`, `getTotalStudents`, `getPlatformUserCounts`, `getSchoolsWithExpiringSubscriptions`, `getRecentSchools`. School data is never joined across tenants — only aggregate platform counts are presented.

## School Management (`/admin/schools`, `/admin/schools/[id]`)

- List with status filter, contact, currency, member/student counts, created date.
- Create school (server-side validation + slug uniqueness).
- Edit school (branding/currency/timezone, optional fields nullable on the server).
- Suspend / Activate (status toggle) and Archive (via confirm dialog).
- Detail page: overview, subscription summary, administrators (memberships), usage statistics.
- Suspending/archiving a school blocks school-scoped users at the tenant gate (see Subscription Enforcement) without deleting any historical data.

## Subscription Plans (`/admin/plans`)

Configurable plans: name, slug, description, annual price (minor units), active/inactive, student limit, staff limit, feature flags (JSON), notes. Slug is unique; deletion is blocked while the plan has active/trial/grace subscriptions. Plans are fully data-driven — nothing is hard-coded.

## School Subscriptions (`/admin/subscriptions`)

One subscription record per school (unique `schoolId`). Fields: plan, start/end dates, grace period end, status, payment reference, notes, cancelled-at. Supports `TRIAL`, `ACTIVE`, `GRACE_PERIOD`, `EXPIRED`, `SUSPENDED`, `CANCELLED`. Creation validates school/plan existence and plan active state; changing status or cancelling (immediate or with grace days) is audited. Historical subscriptions are never deleted.

## Subscription Enforcement

Centralized, reusable server-side checks in `src/server/services/subscription-enforcement.ts`:

- `checkSchoolSubscriptionAccess(schoolSlug)` → allowed + subscription details or a reason (ACTIVE/TRIAL/GRACE_PERIOD are allowed; GRACE_PERIOD only while `gracePeriodEnd` is in the future; EXPIRED/SUSPENDED/CANCELLED blocked; end-date expiry blocked).
- `enforceSubscriptionAccess(schoolSlug)` → throws when not allowed.
- `checkUsageLimits(schoolSlug, "student" | "staff")` → current count vs plan limit.
- `enforceUsageLimit(schoolSlug, type)` → throws when a plan limit is reached.

**Wired at the tenant gate** (`[school]/layout.tsx`): platform staff bypass; school-scoped users get `notFound()` when the school is not `ACTIVE` **or** the subscription is not in an allowed state. `SUPER_ADMIN` is never subject to subscription checks (platform staff always bypass). Usage-limit helpers are reusable for future create operations and future billing integrations (map a new payment provider onto `setSubscriptionStatus` without touching modules).

## Usage Limits

Plan `studentLimit`/`staffLimit` (null = unlimited). Reusable server-side checks exist; consumption counts derive from `Student` (active, not archived) and `Membership` (SCHOOL_ADMIN/TEACHER) per school. Enforcement is server-side only — no frontend-only gating.

## Platform Users (`/admin/users`)

Lists platform-role users (`SUPER_ADMIN`, `SUPPORT`) with their school-membership count. School-scoped roles (`SCHOOL_ADMIN`, `TEACHER`, `STUDENT`, `PARENT`) remain membership-based; school administrators cannot assign platform roles (no such UI/path exists, and all admin mutations are SUPER_ADMIN-only server actions).

## Support Access

`SUPPORT` is given **explicit read-only** platform permissions via `canAccessPlatform` and the permission matrix. Admin pages are SUPER_ADMIN-only in this phase; SUPPORT has no implicit unrestricted access to private school data and does not inherit school-scope capabilities.

## Audit Log (`/admin/audit`)

`createAuditLog` records actor, school (when applicable), action, entity/entity-id, timestamp, and JSON metadata. Every admin mutation action in `src/server/actions/admin.ts` writes an entry:
- school creation → `SCHOOL_CREATE`
- school edits → `SCHOOL_UPDATE`
- activate/suspend/archive → `SCHOOL_STATUS_CHANGE` (with from→to)
- subscription create / status change / cancel → `SUBSCRIPTION_CREATE` / `SUBSCRIPTION_STATUS_CHANGE`
- plan create / update / delete → `PLAN_CREATE` / `PLAN_UPDATE` / `OTHER` (delete)

The audit page lists entries newest-first with actor, entity, school, and metadata.

## Security & Tenant Isolation

- All platform authorization is enforced **server-side** in server actions (`assertSuperAdmin`) and in `(admin)/layout.tsx` — client-supplied roles/actors are never trusted (actor is always the session user).
- Existing school access (`requireSchoolAccess`) requires a membership **or** a platform role; roles are never trusted from the client.
- Cross-tenant data access is prevented: school-scoped queries go through `getSchoolBySlug`-derived `schoolId` scoping; admin school management uses platform services that are SUPER_ADMIN-gated.
- School gates (status + subscription) apply to school-scoped users only — platform staff bypass — so subscription enforcement is not a tenant-isolation bypass and school admins can never reach `/admin`.
- `notFound()` (not 403s) is used at the tenant gate to avoid leaking which school slugs/subscription states exist.

## Validation Results

| Step | Result |
|------|--------|
| `npx prisma validate` | ✅ |
| `npx prisma generate` | ✅ |
| `npx next typegen` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ (0 errors, 0 warnings) |
| `npm run build` | ✅ (51 routes, incl. `/admin` + 6 admin routes) |

Build issues found and fixed during validation:
1. `(admin)/page.tsx` collided with `(marketing)/page.tsx` at `/` — dashboard moved to `(admin)/admin/page.tsx` so it lives at `/admin`.
2. Client dialogs imported server services (`db` → `pg` driver), dragging Node built-ins into the browser bundle — replaced with `src/server/actions/admin.ts` server actions.
3. Base-UI `Select.onValueChange` passes `string | null` — call sites now coalesce `v ?? ""`.
4. `subscription-plans.updatePlan` null-JSON typing (`Prisma.DbNull`) — rebuilt the update payload inline.

## Runtime Status

- **PostgreSQL**: Unavailable (P1001) — no live query/runtime testing performed. Admin pages show `prisma:error` noise during static prerender of the marketing page in this environment but build and dual render fine.
- **Payment integration**: None (per spec) — no M-Pesa/Stripe/cards/SMS/email. Subscription architecture only; `setSubscriptionStatus` is the seam for later billing.
- **Seeding**: No fake schools, users, plans, or subscriptions added.

## Exclusions (per spec)

- ❌ M-Pesa / Stripe / card payments
- ❌ SMS / email providers
- ❌ Fake subscription payments
- ❌ Seeded fake schools or users

## Remaining Issues / Follow-ups

1. **Enforcement breadth**: The tenant gate now blocks suspended/archived schools and expired subscriptions. Usage-limit *write* enforcement (`enforceUsageLimit`) is available but not yet called in student/staff creation paths — wire it when per-plan limits should block record creation.
2. **Plan detail/edit UI**: Plans list has activate/delete; an edit page/dialog for full plan fields is not yet built (services + actions support it).
3. **Subscription renewal history**: One subscription slot per school (`@@unique([schoolId])`); a full renewal-history model can be layered on later (audit entries already record status changes).
4. **SUPPORT management UI**: `/admin/users` is read-only this phase; role assignment/promotion actions are future work (guarded actions ready).
5. **Admin mobile nav**: The admin sidebar is hidden on small screens (`lg:block`) with no mobile drawer yet (same behavior as the school dashboard).