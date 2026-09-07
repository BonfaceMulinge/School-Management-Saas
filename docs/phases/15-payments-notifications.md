# Phase 15 — Payments, Email & SMS Infrastructure

## Summary

Phase 15 builds the provider-agnostic payments stack on top of the existing finance ledger, plus honest email/SMS delivery: payment provider abstraction, school fee payments, SaaS subscription payments, a secured webhook endpoint, outbound email/SMS services, outbound delivery records, and platform admin configuration. Secrets are never stored in the database or committed; they come exclusively from environment variables.

**Outcome: COMPLETED.** Schema extension and migration `20260907090511_phase15_payments_notifications` applied; payment service, mock provider, webhook route, outbound email/SMS modules, platform admin pages (Integrations + Payments), and the school Online Payments page are in place; the full validation chain is green (tsc, eslint, **99/99 tests** incl. 39 live-DB integration tests, production build). Integration test fixtures are cleaned up via `scripts/db-cleanup.js`.

---

## 1. Data Model — COMPLETED (applied)

Migration `20260907090511_phase15_payments_notifications` adds:

- **`IntegrationConfig`** — per-channel (`PAYMENT`/`EMAIL`/`SMS`) provider selection. `provider` is a safe name (currently `"mock"` or none); `mode` `SANDBOX`/`LIVE`; `enabled` gate; `meta` holds **non-secret** display/tuning data only.
- **`PaymentTransaction`** — single source of truth for provider money movement: `purpose` (`FEE_PAYMENT`/`SUBSCRIPTION`), `amount` Decimal(12,2), `currency`, unique `idempotencyKey` (dedupes initiation), `provider`, `providerReference` (unique), `status` (`PENDING → SUCCEEDED/FAILED/EXPIRED`), `checkoutUrl`, verification actor/timestamps, `expiryAt`.
- **`WebhookEvent`** — every provider webhook recorded with `@@unique([provider, providerEventId])` for idempotent replay; `status` `RECEIVED/PROCESSED/IGNORED/FAILED`; safe `processingNote`.
- **`OutboundMessage`** — honest delivery record per email/SMS with unique `dedupeKey` (retries can never duplicate); `status` `PENDING/SENT/FAILED/SKIPPED`; provider + optional `providerReference`; safe `errorReason`. **A message is SKIPPED when no provider is configured — delivery is never faked.**
- **`FeePayment` / `SchoolSubscription`** extended with provider fields; `PaymentMethod` gained `ONLINE`; new `AuditAction` values `PAYMENT_INITIATED`, `PAYMENT_VERIFIED`, `PAYMENT_FAILED`, `WEBHOOK_RECEIVED`, and `INTEGRATION_CONFIG_CHANGE`.

All money remains `Decimal(12,2)`; all cross-tenant data is school-scoped; `prisma migrate status` reports **no drift** after applying.

---

## 2. Payment Service — COMPLETED

`src/server/integrations/payments/payment-service.ts` orchestrates everything:

- **Initiation** (`initiateFeePayment`, `initiateSubscriptionPayment`) creates a `PENDING` transaction, calls the provider (`initiate`), stores the provider reference/checkout/expiry, and records a `PAYMENT_INITIATED` audit row. Re-initiation with the same `idempotencyKey` returns the existing transaction (`reused: true`).
- **Server-side verification** (`verifyAndApplyPayment`) never trusts the client: it asks the provider (`getStatus`) and only applies on a confirmed success. A `PENDING` provider status leaves the transaction `PENDING`; a `FAILED` status marks it `FAILED` with a safe reason.
- **Webhooks** (`processProviderWebhook`) verify the HMAC signature, look up the transaction by `providerReference`, **cross-check** payload `schoolRef`/`amountMinor`/`currency` against the stored transaction (never trusting client hints), persist the event idempotently, and apply only when the provider explicitly reports success.
- **Application** (`applyFeePayment`, `applySubscriptionPayment`) runs inside a `Prisma.TransactionIsolationLevel.Serializable` transaction, re-checks `status === "PENDING"`, and flows through the **existing** ledger architecture — fee payments create an `ONLINE` `FeePayment` (`RCP-<year>-OL-######`) via `resolveEnrollmentSnapshot`; subscription payments activate/renew and append an immutable `SubscriptionEvent`. A concurrent webhook + verify can never double-apply.
- Notifications are sent post-apply via `sendPaymentReceipt`, `sendSubscriptionNotification` with stable dedupe keys (`receipt-<tx>`, `sub-notify-<tx>`, `sms-receipt-<tx>`).

## 3. Providers

- **Typed provider contracts**: `PaymentProvider`, `EmailProvider`, `SmsProvider` define `initiate`/`getStatus`/`verifyWebhookSignature`/`parseWebhookEvent` and `send` respectively — real gateways (Stripe, Flutterwave, SES, Twilio, …) implement these behind `resolve*Provider()`, which today returns `null` unless `"mock"` is configured.
- **`MockPaymentProvider`** (dev/tests only): deterministic `mock_tx_<sha16(idempotencyKey)>` references and `mock_evt_<sha16(ref)>` events; SUCCEEDED by default, FAILED/PENDING for references listed in the channel's `meta.failingReferences`/`pendingReferences`; webhooks HMAC-SHA256 with `PAYMENT_PROVIDER_KEY`. No credentials embedded.
- **Email/SMS registries** (`resolveEmailProvider`, `resolveSmsProvider`) return a provider only when the channel is enabled and a provider is selected. Until one exists, outbound messages are `SKIPPED — no provider is wired for this build`.

## 4. Outbound Email / SMS — COMPLETED

`src/server/integrations/outbound.ts`:

- `sendOutboundEmail`/`sendOutboundSms` render templates, persist an `OutboundMessage`, and on a configured provider actually send (→ `SENT` + `providerReference`) or surface the failure (`FAILED` + safe `errorReason`).
- Channel gates: respected (`enabled` + provider configured); SMS **consent** comes from school `NotificationPreferences` (payment confirmations → `feePayment`, reminders → `feeReminder`); consent-disabled messages are `SKIPPED`.
- Recipient resolution: school email / `School.phone` (`toSchoolContact`) / explicit phone / `Staff.phone` via `userId`. (Guardian and User have no phone field, so those are not SMS targets.)
- Templates (`email/templates.ts`, `sms/templates.ts`): `{{key}}` substitution with a `requires` list — a missing required variable is reported and **never** sent broken content.

## 5. Webhook Endpoint — COMPLETED

`POST /api/webhooks/[provider]` (Next 16 Promise `params`):

1. Raw body read; signature header picked by provider name; invalid signature → **401, nothing persisted**.
2. Event parsed; missing event id/transaction reference → **400**.
3. Transaction lookup by `providerReference`; **unknown → 400**; school/amount/currency mismatch → **403/400**.
4. Duplicate `(provider, providerEventId)` → **200 IGNORED** (recorded once).
5. Success confirmed → server-verified application; provider gets `200 PROCESSED`.

## 6. Server Actions & Admin UI — COMPLETED

- **Platform** (`src/server/actions/integrations.ts`): `listIntegrationsForAdmin`, `updateChannelConfigAction` (super-admin only, audit + revalidation), `listOutboundMessagesForAdmin`, `listPaymentTransactionsForAdmin`, `initiateSubscriptionPaymentAction`, `verifySubscriptionPaymentAction` (returns the server-derived status).
- **School** (`src/server/actions/payments.ts`): `initiateOnlineFeePayment` (zod-validated, school-scoped student, idempotency key, finance revalidation), `verifyOnlineFeePayment` (tenant + purpose checked), `listOnlinePayments`.
- **Admin pages**: `/admin/integrations` (per-channel cards: provider/mode/enabled, secret-present badge — secrets never shown), `/admin/payments` (charge-subscription + verify buttons, transaction table, outbound message table), wired into the admin sidebar.
- **School page**: `/<school>/payments` — initiate an online fee payment (opens provider checkout) and verify pending transactions; finance-managed UI only for the form/verify actions.

## 7. Security & Honest-Delivery Rules

- **No client-trusted success**: money moves only after a server-side provider check or a signature-verified webhook.
- **No secrets in DB/code**: `PAYMENT_PROVIDER_KEY`, `EMAIL_PROVIDER_KEY`, `SMS_PROVIDER_KEY` are read from the environment; the admin UI shows only `secretConfigured`.
- **No fake delivery**: without a provider, outbound messages are `SKIPPED`/`FAILED`, and webhooks reject with “provider is not configured.”
- **Idempotency everywhere**: unique `idempotencyKey`, unique `(provider, providerEventId)`, unique `dedupeKey` on outbound messages.
- Webhook payload `schoolRef`/`amountMinor`/`currency` are **cross-checked, never trusted**.

## 8. Tests — COMPLETED (99/99)

- **Unit (`tests/integrations.test.ts`, pure):** `lib/integrations` helpers (HMAC, constant-time compare, sha256, idempotency/dedupe keys, minor units), email/SMS template rendering incl. the `requires` guard, and the mock provider’s deterministic references/statuses/signatures.
- **Live-DB integration (extended `tests/integration/live-db.integration.test.ts`):** fee initiation + idempotency key dedupe; server-side verify → `ONLINE` `FeePayment` + exact ledger delta + safe re-verify; provider FAILED → no fee payment; PENDING provider status never trusted (then succeeds); webhook applies on valid signature and replays → `IGNORED` (recorded once); invalid signature → 401 and nothing persisted; amount/school mismatch → 400/403 and nothing persisted; subscription payment renews (`RENEWED` event appended, end date extends, provider refs recorded).
- Test harness: `server-only` resolves to a stub under Vitest; `PAYMENT_PROVIDER_KEY` set per-run; `scripts/db-cleanup.js` purges the new tables/config for `itest-*` fixtures.

## 9. Validation Chain — COMPLETED (live)

| Check | Result |
|---|---|
| `npx prisma validate` | ✅ schema valid |
| `npx prisma generate` | ✅ client regenerated |
| `npx prisma migrate status` | ✅ **2 migrations, database schema up to date** |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 |
| `npm run test` | ✅ **5 files, 99/99 passing** (60 unit + 39 live-DB) |
| `npm run build` | ✅ exit 0; `/admin/integrations`, `/admin/payments`, `/[school]/payments`, `/api/webhooks/[provider]` route |

## Final Report

- **Tests passed:** 99/99, including the 8 new live payment-lifecycle cases (idempotent initiation, server-side verify, ledger/`FeePayment` integrity, provider-failure and pending semantics, webhook signature/amount/school enforcement, replay idempotency, subscription renewal).
- **Tests failed:** none.
- **Issues fixed during the phase:** removed a bogus `PrismaTypes` re-export in `payment-service`; replaced a leftover orphaned error block; `Decimal` imported via `Prisma.Decimal`; `markDelivered`/verify-action return types tightened; sync helper exports removed from server-action modules (Next requires async actions); school-payments page; nav wiring; `server-only` guard neutralized for Vitest.
- **Remaining risks:**
  1. No real payment/email/SMS providers are wired yet — registries return `null` and outbound stays `SKIPPED` until a provider is implemented against the typed contracts (documented placeholders).
  2. Real provider webhooks were not exercised (mock-only, deterministic).
  3. The mock checkout URL (`/api/payments/mock/checkout`) is a dev artifact and not a page.
  4. Browser-level E2E (Playwright) is out of scope, as in prior phases.

**STOP — Phase 15 ends here. Phase 16 has not been started.**