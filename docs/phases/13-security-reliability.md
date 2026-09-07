# Phase 13 — Security, Reliability & Testing Hardening

## Summary

Phase 13 is a **hardening pass over the existing application** (no new business modules). It audits the current security model, database/migration state, financial integrity, audit coverage, and adds focused unit tests for the pure/business logic that could not be tested before.

Concrete changes landed this phase:

1. **Security headers** — `next.config.ts` now emits a Content-Security-Policy (with `.upgrade-insecure-requests`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, a locked-down `Permissions-Policy`, and disables the `X-Powered-By` header. CSP uses `'unsafe-inline'` for styles (required by the shadcn/Base UI stack) and `'unsafe-eval'` only in development.
2. **Permission matrix extraction & drift fix** — the single source of truth for `PERMISSIONS`, `ROLE_PERMISSIONS` and `PLATFORM_ROLE_PERMISSIONS` moved to a pure module `src/lib/permissions.ts` (no `server-only`, no database). `authorization.ts` re-exports it so all 78 existing importers keep working unchanged. **Genuine bug fixed**: `canAccessPlatform` in `platform-auth.ts` maintained its own copy of the SUPPORT role grants, which could silently drift from the real matrix; it now delegates to the shared matrix.
3. **Money helpers extracted** — `MONEY_PATTERN`, `MAX_MONEY`, `roundMoney`, `toDayStart`, `toDayEndExclusive` moved to a pure `src/lib/money.ts` and are re-exported by `src/server/services/finance.ts` for compatibility. `roundMoney` gained an epsilon bump so float-accumulation drift (e.g. `0.1 + 0.2`) displays cleanly.
4. **Financial audit logging** — the finance actions now write `FINANCIAL_ACTION` audit-log entries for every money-moving mutation: `recordPayment`, `chargeStudents`, `addChargeAdjustment`, `correctPayment` and `reversePayment`. Corrections/reversals log **inside the same `$transaction`** as the payment change, so the audit row and the mutation commit atomically. The persistent `PaymentAdjustment` / `ChargeAdjustment` tables remain the detailed old/new trail; audit logs give a unified, filterable event stream. (While auditing, a self-introduced typo that mis-tagged method changes with the date-change flag was caught by `eslint` and fixed.)
5. **Unit tests** — added Vitest with three focused test files covering pure logic: `safeRedirect` (open-redirect protection), the full permission matrix, and money/day-boundary math. **33 tests pass** with no database connection required.
6. **Migration state** — `prisma/migrations/` is empty and no initial migration exists; creating one requires a live database. Documented below.

The full validation chain passes (`prisma validate`, `prisma generate`, `tsc --noEmit` with exit 0, `eslint` with exit 0, `next build` with exit 0). PostgreSQL remains unavailable (P1001), so **no runtime DB verification, migration, or seed data was performed** — the findings that need a live database are explicitly called out as such.

---

## Security Headers

`next.config.ts` (previously an empty config):

```ts
// CSP uses 'unsafe-inline' for styles (shadcn/Base UI inline style objects)
// and 'unsafe-eval' only in dev (React devtools). No nonces: every page is
// already server-rendered behind tenant auth, and nonce-CSP would force all
// pages onto a fully dynamic render path.
const cspHeader = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

securityHeaders = [
  Content-Security-Policy,              // above
  X-Frame-Options: DENY,                // clickjacking
  X-Content-Type-Options: nosniff,      // MIME sniffing
  Referrer-Policy: strict-origin-when-cross-origin,
  Permissions-Policy: camera/mic/geo/interests disabled,
];

poweredByHeader: false,
headers() → [{ source: "/(.*)", headers: securityHeaders }]
```

Applied to `/(.*)`, so HTML and API responses carry them. The Node `src/proxy.ts` gate is unchanged — it stays a cookie-presence redirect because real auth always re-validates in layouts/server functions.

---

## Permission Matrix Extraction & Drift Fix

**Before:** `PERMISSIONS` + both matrices lived inside `src/server/authorization.ts` behind `"server-only"` + `db` imports (untestable). `platform-auth.ts` line 124 kept a hand-maintained `supportGrants` list for `canAccessPlatform` — a second copy of SUPPORT's grants that could silently diverge.

**After:**

- `src/lib/permissions.ts` (pure, import-safe anywhere): `PERMISSIONS`, `ROLE_PERMISSIONS`, `PLATFORM_ROLE_PERMISSIONS`, the `Permission` / `SchoolRole` / `PlatformRole` types, and pure checks `hasSchoolRolePermission` / `hasPlatformRolePermission`.
- `src/server/authorization.ts` imports the pure module, delegates its internal checks to it, and `export { PERMISSIONS, type Permission, … }` to keep every existing importer working.
- `src/server/platform-auth.ts` `canAccessPlatform` now calls `hasPlatformRolePermission` — SUPER_ADMIN (`"*"`) and SUPPORT both resolve against the one matrix. The duplicate `supportGrants` array is gone.

No behavior changed for any role; this is purely a reliability improvement (single source of truth) plus testability.

---

## Financial Audit Logging

`AuditAction.FINANCIAL_ACTION` existed but was never emitted. Now logged (actor, school, entity, entityId, structured metadata):

| Action | Where written | Audit row |
|---|---|---|
| `recordPayment` | after insert | `FeePayment` + receiptNo, amount, method, date, year/term |
| `chargeStudents` | after transaction | `StudentCharge` structure + item/student counts, created/skipped |
| `addChargeAdjustment` | after insert | `ChargeAdjustment` + charge/student, type, amount, reason |
| `correctPayment` | **inside `$transaction`** | `FeePayment` + old/new amount/date/method, reason |
| `reversePayment` | **inside `$transaction`** | `FeePayment` + receiptNo, amount, reason |

None of these rows contain tokens, secrets, or plaintext passwords. The `PaymentAdjustment` / `ChargeAdjustment` tables (old/new before-and-after values, `reason`, `recordedById`, timestamps) remain the authoritative detailed trail and are untouched.

---

## Unit Tests

Vitest was added as a devDependency (`npm run test` / `npm run test:watch`). Config lives in `vitest.config.ts` with the `@/` alias mapped to `src/`; tests live in `tests/`.

| File | What it covers |
|---|---|
| `tests/url.test.ts` | `safeRedirect`: absolute, protocol-relative (`//`), backslash (`\\`) and non-`/` targets rejected; nested paths + query strings preserved |
| `tests/permissions.test.ts` | Full school matrix (SCHOOL_ADMIN has every non-`admin:*` perm, TEACHER/STUDENT/PARENT/STAFF boundaries), platform matrix (`"*"` only for SUPER_ADMIN, SUPPORT can view-not-manage admin areas), matrix consistency checks |
| `tests/money.test.ts` | `roundMoney` float-drift recovery, `MONEY_PATTERN` bounds (≤9 int digits, ≤2 decimals, positive), `toDayStart`/`toDayEndExclusive` UTC day boundaries |

Result: **3 files, 33 tests, all passing** with zero DB connectivity.

> Note on `roundMoney(1.005)`: `1.005` is not exactly representable as a float (nearest double is `1.004999…`), so tests deliberately avoid asserting half-cent edge semantics on non-representable literals. All amounts are stored as `@db.Decimal(12,2)`, so such inputs never originate from the database; `roundMoney` only reconciles float accumulation drift on display.

---

## Database / Migration State

- `prisma validate` passes; `prisma generate` regenerates the client cleanly.
- **`prisma/migrations/` is empty** — no migration has ever been created. The app runs on the schema-only flow (`db:push`-style), which is fine for development but leaves production without an upgrade path.
- Creating the initial migration requires `prisma migrate dev` **against a reachable PostgreSQL**, which is not available in this environment (P1001). This is the single concrete remaining database action for Phase 14+.
- Cascade/retention audit (schema review): financial records (`FeePayment`, `ChargeAdjustment`, `PaymentAdjustment`) are `Restrict` on student/user delete and `Cascade` on school delete; session/token rows cascade with their user; audit logs `SetNull` on school delete. Retention is consistent with the "school = data boundary" model.

---

## Validation Results

| Check | Result |
|---|---|
| `npm run test` | 33/33 passing |
| `npx prisma validate` | schema valid |
| `npx prisma generate` | client regenerated (7.10.0) |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (no warnings) |
| `npm run build` | exit 0, all routes compiled |

## Remaining Risks / Follow-ups

1. **No database reachable** — runtime DB smoke tests, the initial Prisma migration, and live index verification could not run. Do not merge to a production DB without creating and applying the initial migration.
2. **CSP not verified against live UI** — the policy is standard and dev-tolerant, but should be smoke-tested in a browser against the actual shadcn/Base UI pages once PostgreSQL is available end-to-end (dev server can’t render school pages without a DB).
3. **Concurrency** — duplicate-charge and duplicate-receipt checks are pre-check + unique-index guarded; a concurrent double-submit on the same ledger could still surface one as a unique-constraint error rather than a friendly message. Acceptable for now; wrapping the writes in a retry-on-P2002 is a possible follow-up.
4. **Audit log growth** — no retention/archive job exists for `AuditLog`; consider a scheduled purge/Rollup policy before high-usage production go-live.