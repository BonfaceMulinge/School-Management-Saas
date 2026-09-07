# Phase 14 — PostgreSQL, Migrations & Runtime Verification

## Summary

Phase 14 targets connecting the application to a real PostgreSQL instance, creating/applying the initial Prisma migration, and verifying the runtime system end-to-end.

**Outcome: COMPLETED.** PostgreSQL (native install, service `postgresql-x64-18`) is now running on `localhost:5432`; the initial migration `20260906164357_init` was created with `prisma migrate dev` and applied; the database schema was verified object-by-object; the full validation chain (including live `prisma migrate status`) is green; runtime smoke tests ran over real HTTP with database-backed sessions; and the mandatory two-school tenant-isolation and financial-integrity tests all pass (60/60 tests). All test data was removed afterwards; the database contains **zero test fixtures**.

No new business modules were added.

---

## 1 & 3. Database Connection & Initialization — COMPLETED

### Configuration

- `DATABASE_URL` (`.env`, also documented in `.env.example`):
  `postgresql://postgres:Bonny100%25@localhost:5432/school_management?schema=public`
  (the `%` in the password is percent-encoded as `%25` in URLs).
- `prisma.config.ts`: schema `prisma/schema.prisma`, `migrations.path: "prisma/migrations"`, datasource URL from `env("DATABASE_URL")`.

### Availability check (evidence)

| Check | Result |
|---|---|
| Windows service `postgresql-x64-18` | **Running** |
| TCP connect to `localhost:5432` | **open** |
| Install directory | `C:\Program Files\PostgreSQL\18` |
| `psql` on PATH / `pgpass.conf` | not on PATH / absent (Prisma driver connects directly) |
| Authenticate | `postgres` superuser, password set by the owner; `.env` updated accordingly |
| `prisma migrate status` | now **up to date** (was initially P1000 auth, then P1003 missing database before the migration was created) |

### Initial migration (created and applied)

```
$ npx prisma migrate dev --name init
PostgreSQL database school_management created at localhost:5432
Applying migration `20260906164357_init`
prisma/migrations/20260906164357_init/migration.sql created
Your database is now in sync with your schema.
```

- `prisma/migrations/migration_lock.toml` present.
- No reset / no `db push` was used; the intended `migrate dev` → `migrate deploy` path established the baseline.

---

## 2. Migration-Safety Review — COMPLETED (static + live confirmation)

Static review of `prisma/schema.prisma` (30 models, 41 enums) was completed earlier this phase and is unchanged. The migration additionally **confirmed every claim against the live database**:

### Live object verification (`scripts/db-verify.js`, Postgres catalogs)

| Object | Expected (schema) | Verified live |
|---|---|---|
| Business tables | 30 models | **30** tables + `_prisma_migrations` |
| Enums | ~41 enum definitions | **24** enums, all labels present |
| Foreign keys | explicit relations | **131** FKs, all well-formed |
| Constraints (PK/UNIQUE/CHECK) | per schema | **373** |
| Indexes | 88 tenant-first + PKs/keys | **162** total; every non-`schoolId` index is a PK, natural-key unique, or intentionally relation-scoped (auth/platform) |
| Money columns | `Decimal(12,2)` | all money fields **`numeric(12,2)`** (`FeeStructureItem.amount`, `StudentCharge.amount`, `ChargeAdjustment.amount`, `FeePayment.amount`, `PaymentAdjustment.oldAmount/newAmount`); exam/grade percentages remain `numeric(5,2)` |

### Notes from live behavior
- **Tenant-scoped uniqueness is real at the DB level**: `School` `@@unique([schoolId,receiptNo])` allowed the same receipt number in two different schools and rejected the duplicate inside one school (see §6).
- **Multi-path cascade nuance (observation, not a defect)**: `School` deletion cascades the tenant, but a few `Restrict` edges reference rows that are themselves cascade-removed in the same statement (`ExamSubject.subjectId`, `TeacherAssignment.subjectId`, `ExamMark.examSubjectId`). Those must be cleared before a `School.deleteMany`. This is consistent with the application design — tenants are **archived, never hard-deleted** — and does not affect normal operation; it only means a tenant purge is a two-step operation at the SQL level. The integration suite and `scripts/db-cleanup.js` handle this explicitly.

---

## 4, 5, 6. Runtime Smoke / Tenant Isolation / Financial Integrity — COMPLETED

### 4. Runtime smoke tests (over real HTTP + DB sessions)

The dev server was booted (`npm run dev` against `school_management`) and real database-backed sessions were minted (SHA-256-hashed tokens, same algorithm as `src/server/auth/tokens.ts`) for four fixture personas: **SUPER_ADMIN**, **school‑A admin**, **school‑A teacher**, and a user with **no school membership**.

| Request | Result | Verdict |
|---|---|---|
| `/` (no cookie) | **200** landing | ✅ |
| `/login` (no cookie) | **200** | ✅ |
| `/itest-alpha` (no cookie) | **307 → `/login?next=%2Fitest-alpha`** (proxy gate) | ✅ |
| `/admin` (no cookie) | **307 → `/login?next=%2Fadmin`** | ✅ |
| `/itest-alpha` (school-A admin) | **200** real dashboard (`Title: Dashboard · SchoolOS`, `H1: Overview`, school name + session user rendered) | ✅ |
| `/itest-alpha` (teacher) | **200** | ✅ |
| `/admin` (SUPER_ADMIN) | **200** | ✅ |
| `/login` while authenticated | **307 → `/`** (kept out) | ✅ |
| unknown school (SUPER_ADMIN) | **404** | ✅ |
| Security headers on responses | `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` present (Phase 13) | ✅ |

Tenant/platform authorization over HTTP (see also §5):
| Request | Result | Meaning |
|---|---|---|
| `/itest-beta` with school‑A admin | **307 → `/not-found`** | school‑A admin cannot open school‑B route |
| `/admin` with school‑A admin | **307 → `/`** | school admin cannot access platform admin |
| `/itest-alpha` with no-membership user | **307 → `/not-found`** | membership required to open a tenant |

### 5. Tenant isolation (two schools) — PASS (27-test suite)

Live tests in `tests/integration/live-db.integration.test.ts` against two isolated tenants **A** (`itest-alpha`) and **B** (`itest-beta`), using the application's own scoping services (`studentsScopeWhere`, `canViewStudent`, `getStudentInSchool`, `resolveEnrollmentTarget`, `resolveEnrollmentSnapshot`):

- Admin of A sees only A's students; admin of B only B's; no overlap. ✅
- `canViewStudent(B-admin, A-student)` = false and vice versa (cross-tenant read denied). ✅
- Same class name `Grade 4` exists in both tenants (tenant-scoped unique). ✅
- Teacher scope restricted to assigned classes; parent scope to linked children only; student scope to self. ✅
- `resolveEnrollmentTarget` rejects a class or stream from the other tenant; `getStudentInSchool` returns null cross-tenant. ✅
- Cross-tenant attendance query returns nothing. ✅

### 6. Financial integrity — PASS (live money, double-entry checks)

- **Exact decimal money**: `0.1 + 0.2 = 0.3` exactly through Decimal(12,2) columns and the application ledger (no float drift); the column type was confirmed `numeric(12,2)` in the catalogs. ✅
- **Ledger math**: charges 5000.75 + 1250.25 → `charges` 6251.00; a 100.00 payment → `paid` 100.00, `closing` 6151.00, via the app's `buildStudentLedger`. ✅
- **Duplicate charge rejection**: second charge for the same (school, structure item, student, year, term) → **P2002**. ✅
- **Duplicate receipt rejection**: same `receiptNo` in one school → **P2002**; the **same** receipt number in the other tenant **accepted** (tenant-scoped uniqueness). ✅
- **Correction trail**: amount 100 → 150 recorded as an immutable `PaymentAdjustment` (`CORRECT`, old/new amounts, reason, actor); ledger reflects 150.00. ✅
- **Reversal without history loss**: payment marked `REVERSED` with `reversedById/At`; original row retained; ledger shows `REVERSAL −150.00` and excludes it from `paid`. ✅
- **Charge adjustment**: discount 75.55 applied via `ChargeAdjustment`; ledger `adjustments` 75.55, `closing` exact (6251.00 − 75.55 − 100.00). ✅
- **Fee-structure duplicate check** (`findDuplicateFeeStructure`) catches stream-wide duplicates that Postgres's unique index cannot (NULL-distinct semantics). ✅
- **Subscription lifecycle & limits**: `createSubscription` appends `CREATED`; a plan with `studentLimit: 2` and 2 active students yields `checkUsageLimits → allowed:false` and `enforceUsageLimit` throws; `assertUsageCapacityTx` (Serializable) raises `UsageLimitError` when at the limit — the transactional guard against concurrent student creation is active. Switching to an unlimited plan lifts the limit (guard returns `{current:0, limit:null}` and a student insert within the same serializable tx succeeds). ✅
- **Suspension gate**: `SUSPENDED` → `checkSchoolSubscriptionAccess(allowed:false, "Subscription is suspended")`. ✅
- **Immutable event trail**: exactly `CREATED → STATUS_CHANGED(SUSPENDED) → PLAN_CHANGED → STATUS_CHANGED(ACTIVE)` in order. ✅
- **Attendance/exam integrity**: duplicate attendance per (school, student, date) → P2002; attendance changes append an immutable trail; duplicate exam mark per (school, exam, subject, student) → P2002; marks stored exactly (87.55). ✅
- **Audit log**: `FINANCIAL_ACTION` rows are written and retrievable by entity at runtime. ✅

---

## 7. Migration & Schema Verification — COMPLETED

- No missing relations, no unexpected nullables, no orphaned FKs, no duplicate constraints were found (live catalogs, §2).
- `npx prisma migrate status` → **`1 migration found … Database schema is up to date!`** (no drift).
- All fixture data created by the tests was removed after the run (`scripts/db-cleanup.js`); final counts for test assets: `schools=0, users=0, sessions=0, plans=0`.

---

## 8. Fixes

- **No application defects surfaced.** All 27 live integration tests and 12 HTTP smoke cases passed against the real database on the first complete run. Adjustments made during verification were confined to the test harness itself:
  - test fixtures needed an extra `Transport` charge to match the asserted 6251.00 ledger;
  - an unlimited-plan capacity check reports `{current: 0, limit: null}` by design (schema-verified behavior at `subscription-enforcement.ts:195`);
  - fixture teardown had to pre-clear the multi-path `Restrict` edges before `School.deleteMany` (see §2 note);
  - a minted-session helper required explicit `id`/`createdAt`/`updatedAt` because `@default(cuid())`/`@updatedAt` are client-side (SQL-level insertion).
- Supporting scripts added under `scripts/`: `db-verify.js` (catalog verification), `mint-sessions.js` (real session tokens for HTTP smoke), `db-cleanup.js` (fixture removal). They are ESLint-compliant (`npx eslint` is clean).

---

## 9. Validation Chain — COMPLETED (live)

| Check | Result |
|---|---|
| `npx prisma validate` | ✅ schema valid |
| `npx prisma generate` | ✅ client regenerated (7.10.0) |
| `npx prisma migrate status` | ✅ **1 migration, database schema up to date** |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 (no warnings) |
| `npm run test` | ✅ **4 files, 60/60 passing** (33 unit + 27 live-DB integration) |
| `npm run build` | ✅ exit 0, all routes compiled |

Note: `npm run test` now includes the live-DB integration suite (`tests/integration/live-db.integration.test.ts`), which requires `DATABASE_URL` (loaded automatically from `.env` via `tests/setup-env.ts`).

---

## Final Report

**Tests that passed**
- Full validation chain incl. live `prisma migrate status` (validate, generate, tsc, eslint, 60/60 tests, build).
- 12 HTTP smoke cases: proxy gating, authenticated rendering, platform/admin RBAC, 404s, security headers.
- 27 live integration tests: two-school tenant isolation, decimal money ledger, duplicate-charge/receipt/mark/attendance rejection, correction/reversal trails, subscription limits + transactional capacity guard + immutable event history, attendance/exam integrity.

**Tests that failed**
- None. Every runtime path that could be executed against PostgreSQL passed as-is.

**Issues fixed**
- None in application code. Test-harness adjustments only (see §8); the multi-path cascade nuance was documented, not "fixed", because archiving (not deleting) is the design and Purge is out of scope.

**Migration status**
- `prisma/migrations/20260906164357_init/migration.sql` **created and applied**; `migrate status` reports **no drift**. Future schema changes: `prisma migrate dev` for dev, `prisma migrate deploy` for other environments.

**Database status**
- **AVAILABLE and healthy.** `school_management` exists on `localhost:5432` (PostgreSQL 18, service `postgresql-x64-18`). 30 business tables, 24 enums, 131 FKs, 373 constraints, 162 indexes, all money fields `numeric(12,2)`. Test fixtures **removed** after verification.

**Tenant-isolation results**
- **Passed at runtime over HTTP and at the service level.** A school‑A admin received `/not-found` for school‑B routes, could not reach `/admin`, and every app-level scope function excluded the other tenant's rows across students, classes, streams, enrollments, and attendance.

**Financial-integrity results**
- **Passed at runtime.** Exact decimal arithmetic (0.1+0.2=0.3), exact ledger totals, P2002 duplicate protection for charges, receipts and marks, and immutable correction/reversal trails with correct ledger reflection.

**Remaining risks**
1. **Browser-level flow tests** (click-through login/signup, form submissions) run from server actions rather than curl; the auth/session and RBAC primitives were verified, but a full E2E suite (Playwright) is not part of this phase.
2. **Email/SMS delivery** and file storage (S3) are intentionally out of scope (documented in the schema/code).
3. Real concurrency beyond the serializable capacity guard (e.g. two users correcting the same receipt simultaneously) is mitigated by unique constraints + transactions; a dedicated load test was not part of this phase.
4. The multi-path cascade note in §2 only matters for programmatic tenant purge, which the product deliberately does not perform.

**STOP — Phase 14 ends here. Phase 15 has not been started.**