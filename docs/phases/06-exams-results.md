# Phase 6 — Exams, Grading & Academic Results

Status: **Complete** (code) — runtime DB validation pending (see below).

## Data model (`prisma/schema.prisma`)

- Enums: `ExamType` (`CAT | MIDTERM | END_TERM | ASSIGNMENT`), `ExamStatus` (`DRAFT | SCHEDULED | ONGOING | COMPLETED | ARCHIVED`).
- `Exam` — term-focused exam record with class/stream/academic-year/term snapshots plus `createdBy`/`updatedBy` (User relations). Duplicate prevention: `@@unique([schoolId, academicYearId, termId, name, classId, streamId])` for streamed exams, plus a server-side helper that also catches `streamId: null` duplicates (Postgres treats NULLs as distinct, so the DB constraint alone cannot).
- `ExamSubject` — a paper of an exam: subject + `maxMarks` (`Decimal(5,2)`), `sortOrder`, `createdBy`/`updatedBy`. `@@unique([examId, subjectId])` prevents duplicate papers.
- `ExamMark` — one recorded mark: `marksObtained` (`Decimal(5,2)`), enrollment snapshot, `recordedById`/`updatedById` timestamps. `@@unique([schoolId, examId, examSubjectId, studentId])` guarantees a single mark per student/paper.
- `GradeScale` — school-configured grading template: `name`, `isDefault`, max one default per school enforced in the action; first scale created automatically becomes default. `@@unique([schoolId, name])`.
- `GradeBand` — `minPercent`/`maxPercent` (`Decimal(5,2)`), `grade`, optional `points`, `remark`. Overlapping ranges are rejected server-side; first (highest) match wins.
- Back-relations added to `School`, `User` (4 named), `AcademicYear`, `Term`, `Class`, `Stream`, `Subject`, `Student`, `Enrollment`.

## Authorization (`src/server/authorization.ts`)

- New permission keys: `exams:view`, `exams:manage`, `grading:view`, `grading:manage`, `results:view`, `results:manage`.
- Matrix: SCHOOL_ADMIN/SUPER_ADMIN → all six; TEACHER → `exams:view|manage`, `results:view`, `grading:view`; STUDENT/PARENT → `exams:view`, `results:view`; SUPPORT → `exams:view`, `grading:view`, `results:view`.
- `exams:manage` grants exam CRUD **and** marks entry; `results:manage` reserved (auto-published results flow) — page-level `canAccess` for STUDENT/PARENT is handled in-page (they only ever see their own data).

## Tenant & role protections

`src/server/services/exams.ts`:
- `examScopeWhere(access)` → admins/staff see all exams; teachers → exams of their assigned classes/streams; students → their enrollment class; parents → their children's classes; empty scope → a no-match guard.
- `scopeStudentIds(access)` → determines which students a marks-entry or results query may cover (null = all for admins).
- `teacherAssignmentPairs`, `canManageExamFor(access, classId, streamId)`, `canManageSubjectFor(access, classId, streamId, subjectId)` — teachers cannot create/edit/archive exams or enter marks outside exact class/stream/subject assignments.
- `examRoster` — resolves the ACTIVE student roster for an exam's class/stream using `resolveEnrollmentTarget`.

`src/server/services/results.ts`:
- `bandsToView` (high→low), `gradeFor`, `computeStudentExam` (per-subject rows + total/percentage/band; papers with no recorded mark are excluded from the percentage denominator, i.e. treated as un-sat), `addRanks` (standard competition ranking, ties share a rank). A `GradeScale` is required before any grade is displayed (`hasScale` guard on pages).

## Server actions

`src/server/actions/exams.ts`:
- `createExam(slug, formData)` — re-validates tenant, scope (`canManageExamFor`), parses/normalizes subject papers via FormData keys `subjectId[<key>]`/`maxMarks[<key>]`, checks duplicates (DB + server-side), creates exam + papers transactionally, returns `{ examId }` so the client can navigate to it.
- `updateExam` — blocks the snapshot fields (year/term/class/stream) from changing and blocks subject removal or `maxMarks` reduction once marks exist; otherwise updates safely in a transaction.
- `archiveExam` — soft-archive; archived exams are hidden from lists, results, and reports.
- `saveMarks(slug, examId, subjectId, formData)` — client submits `mark[<studentId>]`; action re-asserts `results:manage`-or-equal permission plus `canManageSubjectFor`, resolves the roster, validates 0 ≤ mark ≤ paper `maxMarks` and that the student is on the roster, then upserts per row (repeat upsert cannot double-count due to the unique constraint). Returns `{ saved, updated }`.
- `clearMark(slug, examId, subjectId, markId)` — deletes a single mark after the same scope checks; the UI uses a two-step "Clear → Sure?" button (no nested-form confirm).
- `deleteExam` — blocked when marks exist (archive instead).

`src/server/actions/grading.ts`:
- `upsertGradeScale(slug, input, scaleId?)` — create or update a scale with band normalization; rejects overlapping bands; first scale auto-becomes default.
- `setDefaultGradeScale(slug, scaleId)` — sets one default per school (transactional).
- `deleteGradeScale` — blocked when it is the only scale.

## Pages

- `/[school]/exams` — exams table with year/term/type/status/search filters + pagination; New/Edit dialogs (server-rendered forms, native `<select>`s; create redirects to the exam). Row actions: Open, Edit, Archive (stateful two-step), guarded by `canManageExamFor`.
- `/[school]/exams/[examId]` — exam header with class/stream/year/term/date/status; summary cards (total %, grade, points, rank from `addRanks`); per-subject band pills; the **marks entry table** (per-student inputs `mark[<studentId>]`, live totals, Save + per-cell clear) when the viewer `canEditPaper`, otherwise a read-only table with grades/remarks. STUDENT/PARENT viewers are redirected to `/[school]/results?examId=...` (they never see the class roster). Archived exams render read-only.
- `/[school]/grading` — school grading scales: list with band tables and Default badge; New/Edit dialogs; Set Default and Delete actions (delete disabled when only one scale).
- `/[school]/results` — student report card: staff pick a student (search + pagination over `studentsScopeWhere`); students/parents are locked to themselves/their children; exam selector, per-subject marks/percentage/band/points/remarks, totals + rank within the exam cohort, and academic history (term/year average percentages).
- `/[school]/results/reports` — Academic Reports: filters (year/term/class/stream/exam/subject) with **Class view** (per-student ranked table + class average/range cards, paginated) and **Subject view** (per-exam average/recorded→roster/high-low for the chosen subject across the filtered exams).
- Sidebar navigation now exposes Exams, Grading, Results, Academic Reports (footer → "Phase 6 · Exams & Results"); loading skeletons added for `exams`, `exams/[examId]`, `grading`, `results`, `results/reports`.

## Form/UX decisions

- Forms use native `<input>`/`<select>` because base-ui's Select hidden-input submission is broken — FormData keys are plain and reliable (see action notes).
- Client pattern everywhere: `useActionState` + `ActionResult` + `failureOf(state)`; destructive actions use two-step confirm buttons instead of nested `<form>` dialogs.
- Numbers round to 1 decimal for % display; mark/Decimal fields render via `toNumber()` in server components (never raw `Prisma.Decimal` in the DOM).

## Validation

| Check | Result |
| --- | --- |
| `npx prisma validate` | Pass |
| `npx prisma generate` | Pass |
| `npx next typegen` | Pass |
| `npx tsc --noEmit` | Clean |
| `npm run lint` | Clean |
| `npm run build` | Pass (all exam/grading/results/reports routes compile) |

## Remaining issues / blockers

- **Runtime DB testing impossible**: PostgreSQL is not reachable (P1001). Live CRUD for exam create/edit/archive, marks save/clear, duplicate prevention (streamed + `streamId NULL`), grade-scale overlap/default rules, teacher scope tests, and results/report computations cannot be executed against a real database. All code is type-checked/compiled/linted only.
- Recommended manual pass once a DB is available: create an exam, duplicate-name rejection, stream vs whole-class teacher scope, marks validation (over max / off-roster / duplicate student), grade overlap rejection, default-scale switching, student/parent redirect on exam detail, results search scoping, report ranking ties.
- No mock/seed exam data (per project rule against faking data).
- Results publishing workflow (`results:manage`) and report export (PDF/CSV) deferred to a later phase.