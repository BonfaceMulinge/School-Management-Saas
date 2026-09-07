# Phase 16 — Directional Audit & Remediation

## Summary

Phase 16 remediates the directional audit findings: complete the file-based exam-paper workflow (upload → staff view/download/print; parents/students hard-blocked), confirm the finance + results role-scoping fixes, remove Attendance from the live surface (block-access, files/services/tests/DB retained), apply the approved performance and auth-hardening fixes (N+1 elimination, session idle timeout), and verify the whole chain (prisma, tsc, eslint, tests, production build, runtime smoke).

**Outcome: COMPLETED.** Migration `20260907102953_exam_paper_model` applied; storage is now a real local-disk provider; the exam-paper upload/download/print surface is live and verified over HTTP (teacher upload → admin/teacher inline + attachment download, student/parent 307-denied); exams list/detail, finance structures, and all attendance pages deny the correct roles; N+1 eliminated in the academic/subject performance reports; idle timeout set to 3 days; the full validation chain is green (**6 files / 102 tests**, production build, runtime smoke on a fresh `next start`).

---

## Section-by-section PASS/FAIL report

### 1. File storage foundation (M-series) — PASS
Storage is a real provider abstraction in `src/server/services/storage.ts` with a **local-disk provider** (`LOCAL_DISK`, `UPLOAD_DIR` default `/.uploads`, git-ignored) and an in-memory fallback for edge/test runs. Callers get opaque keys only; file bytes are never referenced by user-controlled paths. Dynamic filesystem access in `storage.ts` is annotated with `/* turbopackIgnore: true */` so the production build is warning-free.

### 2. Exam-paper data model — PASS
Migration `20260907102953_exam_paper_model` adds the `ExamPaper` table: `@@unique([examId, subjectId])` (one paper per subject per exam, replace-on-re-upload), `storageKey` + metadata only — bytes live behind the storage abstraction, `uploadedById` for provenance, cascading delete with the exam. Schema drift checked: `npx prisma migrate status` reports up to date.

### 3. Exam-paper upload (M1/M4-adjacent) — PASS
`src/app/(dashboard)/[school]/exams/[examId]/paper/upload/route.ts` + `uploadExamPaper` in `src/server/actions/exams.ts`: requires `assertPermission("exams:manage")` plus server-side `canManageExamFor`/`canManageSubjectFor`; blocked when the subject or exam is archived; ≤ 10 MB (`PAPER_MAX_BYTES`), MIME restricted to PDF/PNG/JPEG (`PAPER_ALLOWED_MIME`); replaces any existing paper and removes the stale file first; revalidates the exam paths. Verified over HTTP: `{"ok":true,...}` for the assigned teacher, 403/redirect for a student.

### 4. Exam-paper download / print (M5 egress) — PASS
`src/app/(dashboard)/[school]/exams/[examId]/paper/route.ts` streams the file only after `requirePermission("exams:view")` + `examScopeWhere` (exam/class/stream scope) and an **explicit 403 for STUDENT/PARENT memberships** — guardians never receive bytes. `?download=1` → `attachment`, otherwise `inline`; `Cache-Control: no-store`. Verified over HTTP: admin/teacher 200 with `content-type: application/pdf` inline, admin `?download=1` → `attachment`, student/parent → **307 → `/demo-school`**. `papers-section.tsx` renders print/view/download controls (uses `buttonVariants` anchors; Button has no `asChild`).

### 5. Exams visibility leak (L1) — PASS
`exams:view` was removed from the STUDENT/PARENT role grants (`src/lib/permissions.ts`); `/exams` and `/exams/[examId]` both fall through `requirePermission("exams:view", { next })` and the page adds an explicit parent/student redirect/`notFound()`. HTTP smoke: admin/teacher render (`OK`), student/parent responses embed `NEXT_REDIRECT` and/or a `404` digest. **Note for future smoke testing:** page (streaming) responses keep HTTP 200 and carry the redirect/404 as a `<template data-dgst="...">` chunk that the browser applies; route handlers return real 307/404. Verify guards by grepping for those digests, not by HTTP status alone.

### 6. Finance scope (L-finance leak) — PASS
`finance:view` remains granted to STUDENT/PARENT by design; every finance query for them is student-scoped (`financeStudentsScopeWhere`/`studentsScopeWhere`). `finance/structures` blocks PARENT/STUDENT at the page (404 digest in smoke). `finance/statements`, `payments`, `charges` render for all roles but are scoped to the logged-in student / the parent’s children. The finance module card on the dashboard links role-appropriately (`finance/statements` for self-scoped, `finance/structures` otherwise).

### 7. Results scope (L-results leak) — PASS
`/results/reports` (`ClassPerformance`/`SubjectPerformance`) now resolves `scoped = await scopeStudentIds(access)` and constrains every `examMark` query with `studentId: { in: scoped }` and roster queries with `student: { ...(scoped ? { id: { in: scoped } } : {}) }`. Parents/students rank within their own scoped subset (a single child therefore ranks first of one — accepted as correct), and the class dropdown is cosmetic (unscoped) while the underlying exams are scoped.

### 8. Attendance removal (L-block-access) — PASS
Attendance files, services, tests, and DB tables are **retained on disk**; the live surface is blocked server-side. Four routes (`/attendance`, `/attendance/history`, `/attendance/reports`, `/reports/attendance`) replaced with a `notFound()` stub default export (original logic moved to a non-exported `XImpl`) — verified 404 for admin/teacher/student/parent alike. Nav entries, the settings “Attendance alerts” notification row, the dashboard/results attendance summary, and the reports hub attendance card were removed. Key fix: `notFound()` must not be the first statement (it breaks TS flow-narrowing of the retained dead code); the stub/impl split is the clean pattern.

### 9. Performance: N+1 elimination — PASS
`src/server/services/reports.ts`: `academicPerformanceReport` uses a single `examMark.findMany` with `examId: { in: exams.map(e => e.id) }` grouped via a `marksByExam` Map; `subjectPerformanceReport` uses one query grouped via a `marksByPaper` Map keyed `` `${examId}:${subjectId}` ``. No further per-row query patterns were found in the routed pages under review.

### 10. Session idle timeout (M2) — PASS
`SESSION_IDLE_TIMEOUT_MS` in `src/server/auth/constants.ts` set to 3 days (`1000 * 60 * 60 * 24 * 3`), distinct from the 7-day absolute maximum; `tests/auth-session.test.ts` locks this (idle < absolute, idle = 3d, cookie max-age = absolute).

### 11. Tenant/role hardening — PASS
No new hard-coded school IDs or cross-tenant queries introduced; all new queries are school-scoped, all new mutations re-run the throw-based guards (`assertPermission` + `canManageExamFor`/`canManageSubjectFor`); demo/scratch rows and bake-into-UI decisions (no permission-driven nav — static per decision) follow the approved direction.

### 12. Verification & documentation — PASS
Full chain green (see table); live HTTP smoke suite executed against a fresh `next start` (previous stale server on :3000 was killed after it was found serving a pre-session build). `docs/phases/16-directional-audit.md` written. Scratch files removed from the repo root.

---

## Validation Chain (live)

| Check | Result |
|---|---|
| `npx prisma validate` | ✅ schema valid |
| `npx prisma generate` | ✅ client regenerated (Prisma Client 7.10.0) |
| `npx prisma migrate status` | ✅ 3 migrations, database schema up to date |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 |
| `npm run test` | ✅ **6 files, 102/102 passing** (incl. `auth-session` idle-timeout case) |
| `npm run build` | ✅ exit 0 (Turbopack warnings resolved via `turbopackIgnore`) |

## Runtime smoke (fresh `next start --port 3000`, demo school)

| Surface | admin | teacher | student | parent |
|---|---|---|---|---|
| `/exams` list | OK | OK | RD | RD |
| `/exams/[examId]` detail | OK | OK | RD | RD |
| `/exams/[examId]/paper` GET | 200 inline | 200 inline | 307→/demo-school | 307→/demo-school |
| `?download=1` | attachment | — | — | — |
| paper upload (teacher) | — | ok=true | blocked | blocked |
| `/attendance*` + `/reports/attendance` | 404 | 404 | 404 | 404 |
| `/finance/structures` | OK | OK | 404 | 404 |
| `/finance/statements,/payments,/charges` | OK (scoped) | OK (scoped) | OK (scoped) | OK (scoped) |
| `/results`, `/results/reports` | OK (scoped) | OK (scoped) | OK (child-only) | OK (child-only) |

`OK` = page renders; `RD`/`404` = response embeds a `NEXT_REDIRECT` or `NEXT_HTTP_ERROR_FALLBACK;404` digest (page-level streaming keeps HTTP 200; route handlers return real 307/404). Real uploaded file round-trip: 596-byte PDF uploaded by teacher → admin GET returned the identical bytes.

## Final Report

- **Tests passed:** 102/102; paper workflow verified end-to-end over HTTP with real roles.
- **Tests failed:** none.
- **Issues fixed during the phase:**
  - Stale `next start` on :3000 was serving an old build (no exam papers) — restarted fresh; the previous confusing smoke results were artifacts of that stale process.
  - Initial “student/parent 200 on exams pages” readings were **not** a leak — page-level streaming embeds the redirect/404 as RSC digests; confirmed correct and documented for future smoke runs.
  - `paper/route.ts` binary response needed `new NextResponse(new Uint8Array(data))` inside a `Blob` for the build to type-check.
  - `Button` has no `asChild` in this UI kit — `papers-section.tsx` uses `<a className={buttonVariants(...)}>`.
  - `notFound()` as the first statement in the retained attendance code broke TS narrowing — switched to a `notFound()` stub + non-exported `XImpl`.
  - Turbopack build warnings on dynamic fs access in `storage.ts` silenced via `turbopackIgnore` comments.
- **Remaining risks / notes:**
  1. Teacher finance is **off-direction** per the final role chart (finance grants target SCHOOL_ADMIN + STUDENT/PARENT) but is now scope-safe, not leaking — wherever it renders it is student-scoped. Flagged rather than changed to avoid breaking module assumptions.
  2. `StudentDocument` uploads now persist to local disk (storage is real) but the module still has no download path — out of scope, noted for a future phase.
  3. Real provider backends (payments/email/SMS) remain unwired — SKIPPED/FAILED behavior as designed in Phase 15.
  4. Browser-level E2E remains out of scope, as in prior phases; role enforcement was verified via request-level smoke + digests.

**STOP — Phase 16 ends here.**