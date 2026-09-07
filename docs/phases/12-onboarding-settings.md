# Phase 12 — School Onboarding & System Configuration

## Summary

This phase delivers the **first-run experience** and the **configuration/finance/settings surface** for a school tenant:

1. **School onboarding flow** — a 5-step wizard (profile → academic year → classes & streams → subjects → review/finish) that runs once per school, shows progress, can be left and resumed, and treats pre-existing (legacy) schools as already complete. Optional fields are clearly marked; only a handful of core fields are required.
2. **First school-admin provisioning** — a platform SUPER_ADMIN can provision a school's first `SCHOOL_ADMIN` while creating the school or afterwards. The helper reuses an existing account by email (never duplicates users), only sets a password hash when the account has none (plaintext is never stored or logged), and never touches the platform role.
3. **Organised settings** — the settings area is split into sections (General, Branding, Academic, Contact, Communication, Finance, Plan & subscription) with a tabbed sub-nav, guarded by `settings:view` / `settings:manage`.
4. **School configuration preferences** — currency, date/time/first-day formats, receipt numbering, invoice/receipt defaults, academic term-length default, notification & communication preferences are stored as JSON in a new `SchoolSettings` row (1:1 with school). Preferences are stored only; existing business behaviour is unchanged unless a preference explicitly drives it (only currency already drives `formatMoney`).
5. **Subscription & status visibility** — the Plan & subscription section shows the active plan, status, limits and dates (read-only); the school shell renders a clear "subscription required" explanation instead of a silent not-found when the school is active but its subscription is not; a warning banner appears during grace/expiring-soon. School members can never change their own subscription status.
6. **Onboarding safety** — the flow is single-tenant (no cross-school reads), reuses existing duplicate-name guards, adds no records on legacy schools, cannot bypass usage limits, and never assigns platform roles.
7. **Audit logging** — onboarding steps (`ONBOARDING_STEP`), settings changes (`SETTINGS_CHANGE`) and admin provisioning (`SCHOOL_ADMIN_PROVISION`) are recorded with actor, school, action, entity and metadata. No passwords, tokens or secrets are ever logged.

The full validation chain passes (`prisma validate`, `prisma generate`, `tsc --noEmit`, `eslint`, `next build`). PostgreSQL remains unavailable (P1001) — no runtime DB verification was possible and no seed/fake data was added.

---

## Database Changes

### New Models

```prisma
model SchoolSettings {
  id                       String   @id @default(cuid())
  schoolId                 String   @unique
  dateFormat               String   @default("MM/dd/yyyy")
  timeFormat               String   @default("24h")
  firstDayOfWeek           String   @default("MONDAY")
  attendanceStatuses       Json?
  gradingPreferences       Json?
  receiptNumbering         Json?
  defaultAcademicSettings  Json?
  notificationPreferences  Json?
  communicationPreferences Json?
  financeSettings          Json?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  school                   School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
}

model SchoolOnboarding {
  id          String    @id @default(cuid())
  schoolId    String    @unique
  currentStep Int       @default(1)
  completed   Boolean   @default(false)
  completedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  school      School    @relation(fields: [schoolId], references: [id], onDelete: Cascade)
}
```

- `School` gains `settings SchoolSettings?` and `onboarding SchoolOnboarding?` relations.
- `AuditAction` gains `ONBOARDING_STEP` and `SCHOOL_ADMIN_PROVISION`.
- `createSchool` (admin service) now seeds the settings + onboarding rows inside the same `$transaction`.

Legacy schools have no `SchoolOnboarding` row; `getOnboardingForSchool` treats that as `{ currentStep: 5, completed: true }` so the wizard never appears for existing tenants.

---

## Onboarding Flow

| Step | Action | Reuses | Required fields |
| --- | --- | --- | --- |
| 1 School profile | `saveOnboardingProfile` | school update | name, currency, timezone |
| 2 Initial academic year | `saveOnboardingAcademics` | `createAcademicYear`, `createTerm`, `setActiveAcademicYear`, `setActiveTerm` | year name + dates (term optional) |
| 3 Classes & streams | client calls `createClass` / `createStream`; `advanceOnboardingStep` | existing class/stream actions | none |
| 4 Subjects | client calls `createSubject`; `advanceOnboardingStep` | existing subject action | none |
| 5 Review & finish | `finishOnboarding` | — | none |

- The step is stored in `SchoolOnboarding.currentStep`; steps only move forward (resume-from-where-left, never regress).
- `advanceOnboardingStep` refuses to move to an earlier/current step.
- All step actions assert `settings:manage`, are scoped to the accessed school, and record `ONBOARDING_STEP` audits with step/stage metadata.
- The client wizard (`[school]/onboarding/onboarding-wizard.tsx`) shows a stepper, lists already-added classes/subjects live, and refreshes after each write.
- A client `<OnboardingRedirect>` in `[school]/layout.tsx` redirects SCHOOL_ADMIN members to `/[school]/onboarding` anywhere in the school until setup is complete. Platform staff and non-admin members are never bounced.

## Settings Sections

Pages under `[school]/settings/*`, each with a `settings:view`-guarded layout tab-nav (`settings-nav.tsx`) and `settings:manage`-guarded mutations (`settings.ts`) that revalidate and audit `SETTINGS_CHANGE` with section + field metadata.

- **General** — name, timezone, date format, time format, first day of week.
- **Branding** — motto, website, logo URL, primary colour (`#rrggbb` validated).
- **Academic** — default term length + quick links; the academic structure itself stays on its own pages.
- **Contact** — email, phone, address.
- **Communication** — contact email, default announcement audience, and seven in-app notification toggles (stored via hidden inputs; the UI `Switch` is controlled).
- **Finance** — currency, receipt prefix/padding/next-number/auto-increment, invoice prefix, receipt note. Currency writes to `School.currency` so `formatMoney` reflects it immediately.
- **Plan & subscription** — read-only `SubscriptionStatusCard`.

Shared form primitives live in `settings/settings-inputs.tsx` (field wrapper + select wrapper + `SettingsFooter` + currency/timezone option lists). Preference types/defaults/layering live in `src/lib/settings-types.ts` (`mergeSchoolSettings` layers saved JSON over defaults so every consumer reads typed values, unknown keys are discarded).

## School-Admin Provisioning

`src/server/services/school-admin-provisioning.ts` — `provisionSchoolAdmin`:

1. Normalises the email.
2. Looks up or creates the `User` by email (never duplicates).
3. Sets `passwordHash` **only** when the account has no hash; otherwise the supplied password is ignored (never stored).
4. Never reads/writes `platformRole`.
5. Upserts the school `Membership` to `SCHOOL_ADMIN` only; fails if that user already holds a different role in the school (no silent privilege change).

`provisionSchoolAdminWithAudit` wraps it in a `SCHOOL_ADMIN_PROVISION` audit (email, outcome, `passwordSet` — never the password). UI: admin section on the create-school dialog (+ first-admin fields) and a *Provision admin* dialog on `admin/schools/[id]`. Actions: `createSchoolAction` (optional admin) and `provisionSchoolAdminAction` (both SUPER_ADMIN only).

## Subscription Status & Gating

- `[school]/layout.tsx`: non-staff members of an **ACTIVE** school whose subscription check fails get a clear `<SubscriptionRestricted>` explanation (their data is intact; only a platform admin can change the subscription) instead of a silent not-found. Suspended/archived schools still 404.
- A `<SubscriptionStatusBanner>` warns during grace period or when the subscription ends within 30 days; it is informational and links to `/[school]/settings/subscription`.
- Platform staff bypass all of this so they can triage.

## Audit Logging

New actions (`ONBOARDING_STEP`, `SCHOOL_ADMIN_PROVISION`) added to the enum, `listAuditLogs`, and the admin audit badge map. Settings changes reuse `SETTINGS_CHANGE`. Metadata is limited to safe identifiers and field lists — no credentials ever.

## Validation

- `npx prisma validate` ✅ · `npx prisma generate` ✅
- `npx tsc --noEmit` ✅ · `npm run lint` ✅ · `npm run build` ✅ (route count now 57 for the school tenant incl. new onboarding/settings routes; static-gen emits the expected P1001 `prisma:error` because PostgreSQL is offline — this is pre-existing, not a regression)

## Out of Scope (unchanged)

No payment/SMS/email providers, payroll, mobile app, or new major business modules were added. Stored preference JSON is not wired into recording logic beyond currency → `formatMoney`.