# Phase 7 — Finance & Fees Management

Status: **Complete** (code) — runtime DB validation pending (see below).

## Data model (`prisma/schema.prisma`)

- Enums: `AdjustmentType` (`DISCOUNT | WAIVER | ADJUSTMENT`), `PaymentMethod` (`CASH | BANK | CHEQUE | OTHER`), `PaymentStatus` (`APPLIED | REVERSED`), `PaymentAdjustmentType` (`CORRECT | REVERSE`).
- `FeeStructure` — a billing definition for one class/stream within a year + term: `name`, `description`, `archived`, and a server-side duplicate guard because `@@unique([schoolId, academicYearId, termId, classId, streamId])` cannot catch `streamId: null` duplicates (Postgres treats NULLs as distinct) — `findDuplicateFeeStructure` enforces it.
- `FeeStructureItem` — one fee line of a structure: `name`, `amount` (`Decimal(12,2)`), `description`, `sortOrder`, soft-archived with `archived`. Names must be unique within a structure (enforced in the action). `@@unique([structureId, name])`.
- `StudentCharge` — a billed item snapshotted to one student: `itemName`/`amount`/class/stream are frozen at billing time so later edits never rewrite history. `@@unique([schoolId, structureItemId, studentId, academicYearId, termId])` prevents double-charging. `recordedById` → User (`ChargeRecordedBy`).
- `ChargeAdjustment` — discount/waiver/generic reduction applied to a charge. Adjustments can only reduce the remaining billed amount (net ≥ 0 enforced in the action). `recordedById` → User (`AdjustmentRecordedBy`).
- `FeePayment` — a receipt: `receiptNo` (auto `RCP-<year>-<hex>` when blank; `@@unique([schoolId, receiptNo])`), `amount`, `date` (`DateTime @db.Date`, UTC-normalized day), `method` (`otherMethod` when OTHER), `referenceNo`, `note`, class/stream snapshot, `termId` nullable (null = toward the whole year), `status`, `recordedBy`/`reversedBy`/`reversedAt`. `@@index([schoolId, studentId])`, `@@index([schoolId, date])`, `@@index([schoolId, academicYearId, termId])`, `@@index([schoolId, status])`.
- `PaymentAdjustment` — immutable audit trail for corrections (`CORRECT`) and reversals (`REVERSE`): old/new amounts, dates, methods, mandatory `reason`, `recordedById` → User (`PaymentEditRecordedBy`). Cascade-deleted with the payment.
- Back-relations added to `School`, `User` (5 named), `AcademicYear`, `Term`, `Class`, `Stream`, `Student`.

## Authorization (`src/server/authorization.ts`)

- New permission keys: `finance:view`, `finance:manage`, `finance:report`.
- Matrix: SCHOOL_ADMIN → all three; TEACHER → `finance:view` only; STUDENT → `finance:view`; PARENT → `finance:view`; SUPPORT → `finance:view` + `finance:report`.
- Page gates: structures/charges/payments/statements require `finance:view`; reports require `finance:report` (only management sees aggregates). Mutations use `assertPermission(slug, "finance:manage")` and never trust client-supplied ids (schoolId always re-derived from the slug).

## Tenant & role protections

`src/server/services/finance.ts`:
- `financeStudentsScopeWhere(access)` — reuses the students module scope so parents only see linked children, students only themselves, teachers only their classes (displays like Statements use it to bound the student picker; admins see all).
- `findDuplicateFeeStructure(schoolId, yearId, termId, classId, streamId, excludeId?)` — server-side duplicate guard (handles the `streamId NULL` case the DB index cannot).
- `resolveEnrollmentSnapshot(schoolId, studentId, yearId, termId)` — picks the ACTIVE enrollment (exact year+term → year → most recent) so payments snapshot the right class/stream.
- `buildStudentLedger(schoolId, studentId, start, end)` — windowed [start, end) ledger: charges attributed to their term start date, payments to their recorded day. Opening = outstanding before the window; closing = opening + charges − adjustments − paid; rows bounded to the window. Reversed payments inside the window appear as informational `REVERSAL` rows and are excluded from `paid`.
- Money helpers: `MONEY_PATTERN`, `MAX_MONEY` (999,999,999.99), `roundMoney`, `toDayStart`, `toDayEndExclusive`. Client-safe string labels live in `src/lib/finance.ts` so client components never import the Prisma driver.

## Server actions (`src/server/actions/finance.ts`)

- `createFeeStructure(slug, formData)` — parses items via `name[<key>]`/`amount[<key>]`/`description[<key>]`, validates uniqueness + money format, rejects duplicate (year, term, class, stream), creates nested items transactionally.
- `updateFeeStructure` — blocks year/term/class/stream changes once charges exist; rejects item removal when the item has charges; preserves stable item ids (`existing-<id>` keys); updates in a transaction.
- `archiveFeeStructure` — soft-archive (existing charges are snapshotted and keep working).
- `chargeStudents(slug, formData)` — re-resolves the ACTIVE roster for the structure's class/stream/year/term, validates chosen items/students, skips rows guarded by the unique constraint, returns `{ created, skipped }`.
- `addChargeAdjustment` — validates type/amount/reason; amount cannot exceed the charge's remaining billed value.
- `recordPayment(slug, formData)` — validates student/year/term/enrollment, dedupes or auto-generates the receipt, snapshots class/stream, records the payment.
- `correctPayment(slug, paymentId, formData)` — student/year are immutable (prompts a reverse+re-record instead); writes a `CORRECT` `PaymentAdjustment` then updates the payment, in a transaction.
- `reversePayment(slug, paymentId, reason)` — only for `APPLIED` payments; never deletes; writes a `REVERSE` `PaymentAdjustment` + flips status to `REVERSED` in a transaction.
- All actions call `revalidateFinance(slug)` (dashboard + all five finance routes) on success.

## Pages

- `/[school]/finance/structures` — fee structures table with year/term/class/search filters + pagination and a total/charged-item-count; `NewStructureDialog` (plus `EditStructureDialog`/`StructureActions`) wired to the actions; item rows keyed `name[<key>]` etc., add/remove dynamic rows; archive uses a two-step ConfirmDialog.
- `/[school]/finance/charges` — assign-charges panel (structure selector re-navigates via query param, item checkbox list + roster with "charge all" + selected counts) for managers, plus a paginated charges table with adjustment count/net, an inline per-row `AdjustChargeDialog`, and billed/adjusted summary cards.
- `/[school]/finance/payments` — record flow is a two-step dialog (student picker → `?record=<studentId>` server-prepares the form with that student's outstanding bills/period selector); collected/reversed summary cards; paginated receipt list with filters (year/term/method/search); `CorrectPaymentDialog` (pre-filled, requires reason) and `ReversePaymentDialog` (requires reason) for applied payments only.
- `/[school]/finance/statements` — scope-bounded student picker (param or auto when you can see exactly one), year/term period select, printable ledger via `buildStudentLedger` with opening/charges/adjustments/paid/closing cards, running-balance table, `window.print()` support (`print:` Tailwind variants).
- `/[school]/finance/reports` — requires `finance:report`; tabs for **Collection** (per year/term collected + reversed + net), **Outstanding** (per class/stream billed − adjusted − collected, with headcount), and **Payment methods** (volume + share bars), each filterable by year/term/class.
- Dashboard: new **Fee collection** card (billed/adjusted/collected/outstanding for the active academic year + latest 5 receipts) gated by `finance:view`; Finance module card now links to `finance/structures`; sidebar footer → "Phase 7 · Finance & Fees" with 5 finance nav items (Fee Structures, Student Charges, Payments, Statements, Finance Reports) and loading skeletons per route.

## Form/UX decisions

- Native `<input>`/`<select>` everywhere (base-ui Select hidden-input submission is broken); FormData keys are plain and stable.
- Client pattern: `useActionState` + `ActionResult` + `failureOf(state)`; destructive/audit actions use two-step confirm dialogs and always require a written reason (min 3 chars).
- Money: `Decimal(12,2)` in the DB, `.toNumber()` for display, `formatMoney` in `src/lib/format.ts`; never raw `Prisma.Decimal` in the DOM and no float arithmetic without rounding.
- Reversals/corrections are append-only — nothing is ever deleted from the payment history.

## Known approximation

`buildStudentLedger` treats a payment recorded before the window's start as reducing the opening balance. If that payment is reversed **after** the window ends, the reversal (outside the window) is not shown and the opening balance slightly overstates credit. The Statements page discloses this edge case. Outstanding in the dashboard/reports is the simple billed − adjustments − applied-payments figure.

## Validation

| Check | Result |
| --- | --- |
| `npx prisma validate` | Pass |
| `npx prisma generate` | Pass |
| `npx next typegen` | Pass |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Pass (all five finance routes compile) |

## Remaining issues / blockers

- **Runtime DB testing impossible**: PostgreSQL is not reachable (P1001). Live flows — structure create/edit/archive, duplicate structure rejection (incl. `streamId NULL`), charge assignment/skip logic, adjustment net guard, receipt dedupe/auto-generation, payment record/correct/reverse audit rows, ledger windows, report aggregation — cannot be executed against a real database. All code is type-checked/compiled/linted only.
- Recommended manual pass once a DB is available: duplicate structure (streamed + whole-class), double-charge prevention, adjustment-over-billed rejection, duplicate manual receipt, correct/reverse audit rows and statuses, student/parent statement scoping, class/stream snapshots, outstanding vs ledger balance.
- No seed/fake financial data (per project rule).
- **Not built** in this phase (deferred): M-Pesa / mobile-money reconciliation endpoints, SMS notifications, subscriptions, communication module, PDF/CSV statement export.