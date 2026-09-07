# Phase 9 — Reports, Exports & Documents

## Summary

This phase delivers a complete **Report Center** with five category suites (Students, Attendance, Academic, Finance, Communication), a secure **Student Documents** foundation, enhanced **report cards** with school branding and attendance summaries, and **printable receipts** for payments. All reports respect multi-tenant RBAC scopes — parents see only linked children, students only themselves, teachers only assigned classes, admins their entire school.

No fake data was seeded; PostgreSQL is unavailable (P1001) so runtime verification was not possible. The full validation chain passes.

---

## Database Changes

### New Model: `StudentDocument`
```prisma
model StudentDocument {
  id          String        @id @default(cuid())
  schoolId    String
  studentId   String
  type        DocumentType  @default(OTHER)
  title       String
  description String?
  storageKey  String?       // opaque key into backing store; null = not persisted
  mimeType    String
  sizeBytes   Int
  uploadedById String
  updatedById String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  school      School        @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  student     Student       @relation(fields: [studentId], references: [id], onDelete: Cascade)
  uploadedBy  User          @relation("DocumentUploadedBy", fields: [uploadedById], references: [id], onDelete: Restrict)
  updatedBy   User?         @relation("DocumentUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  @@index([schoolId, studentId, createdAt])
  @@index([schoolId, type])
}
```

### New Enum: `DocumentType`
```prisma
enum DocumentType {
  REPORT_CARD
  RECEIPT
  STATEMENT
  CONSENT_FORM
  MEDICAL
  TRANSCRIPT
  OTHER
}
```

### New Permissions
| Permission | Roles granted |
|------------|---------------|
| `documents:view` | SCHOOL_ADMIN, TEACHER, PARENT, STUDENT, SUPPORT, SUPER_ADMIN |
| `documents:manage` | SCHOOL_ADMIN, SUPER_ADMIN |

---

## Reports Implemented

### 1. Student Reports (`/reports/students`)
| View | Filters | Output |
|------|---------|--------|
| **Student list** | search, gender, status, class, stream | Name, admission no., gender, status, class/stream, DOB |
| **Enrollment** | year, term, class, stream, status | Student, year, term, class/stream, enrollment status, enrolled date |
| **Class / stream sizes** | year | Class, stream, student count + totals |
| **Gender distribution** | — | Gender, count, % share |
| **Student status** | — | Status, count, % share |

All views: paginated, CSV export, print-to-PDF.

### 2. Attendance Reports (`/reports/attendance`)
| View | Filters | Output |
|------|---------|--------|
| **Daily register** | date, class, stream | Per-student status (PRESENT/LATE/ABSENT/EXCUSED) + counts |
| **Student history** | student, from, to | Status totals + attendance rate (present+late/total) |
| **Class / stream** | class, stream, from, to | Per-student summary with rate % |
| **Absences & late** | class, stream, from, to | Paginated list of ABSENT/LATE records |
| **Summary** | class, stream, from, to | Aggregate counts + overall rate |

### 3. Academic Reports (`/reports/academic`)
| View | Filters | Output |
|------|---------|--------|
| **Exam results** | exam, year, term, class | Ranked matrix: student, subject marks, %, grade, points, remark |
| **Class performance** | year, term, class | Per-exam: sat count, average % |
| **Subject performance** | exam, subject | Per-subject: max marks, sat, average % |
| **Student history** | student, year | Per-exam % + term averages |
| **Grade distribution** | exam | Count per grade band |

Report cards now include: **school branding**, student info, class/stream, academic year, term, subjects, marks, grades, totals/averages, remarks, **attendance summary** for the exam term.

### 4. Finance Reports (`/reports/finance`)
| View | Filters | Output |
|------|---------|--------|
| **Fee collection** | year, term, from, to | Applied payments grouped by year/term with collected/reversed/net |
| **Outstanding balances** | year, term, class, stream | Per-student: billed, adjusted, collected, outstanding (debtors only) |
| **Student statements** | student, from, to | Full ledger (charges, adjustments, payments) with running balance |
| **Payment history** | from, to, method | Paginated applied payments with receipt no., student, date, amount, method, reference |
| **Payment methods** | from, to | Count, amount, % share per method |

### 5. Communication Reports (`/reports/communication`)
| View | Filters | Output |
|------|---------|--------|
| **Announcements** | status | Title, status, audience, author, published at, expires at |
| **Message activity** | from, to | Conversation participants, message count, first/last message |
| **Notification activity** | from, to | Count by notification type |

---

## Export & Print

- **CSV**: Real browser downloads via `Blob` + `URL.createObjectURL` — no fake files.
- **Print / PDF**: Browser native `window.print()` — user can "Save as PDF".
- Toolbar: `PrintButton` + `CsvExportButton` on every report; `print:hidden` on filter bars/nav.

---

## Student Documents

**Route**: `/[school]/students/[studentId]/documents`

- Metadata only: type, title, description, upload date, uploaded by, file size, MIME.
- **Storage abstraction** (`src/server/services/storage.ts`): `StorageProvider` interface with `put()` returning `null` when no provider configured. No public URLs; files never served directly.
- Upload action (`POST /.../documents/upload`): validates file (PDF/PNG/JPEG/TXT, ≤10 MB), attempts `storage.put()`, only creates DB row if persisted. If no provider → honest error: *"No storage provider is configured — the file was not saved and no document was recorded."*
- Delete action (`POST /.../documents/delete`): removes DB row.
- UI: table with type badge, title, description, uploader, date, size, status badge (Stored / Not persisted), delete for admins.

---

## Report Card Improvements

Enhanced `src/app/(dashboard)/[school]/results/page.tsx`:
- School name in header
- Attendance summary block (present/late/absent/excused counts + rate) for the exam's term/class/stream
- Grade scale badge, rank, totals, subject breakdown with remarks

---

## Receipt Improvements

Enhanced `src/app/(dashboard)/[school]/finance/payments/page.tsx`:
- `PrintReceiptButton` per applied payment
- Opens a styled printable receipt with: school name, receipt no., date, student + admission no., year/term, class/stream, method + reference, recorded by, amount in school currency
- No fake PDF generation — pure browser print

---

## Navigation

Added **Reports** item to `dashboardNav` (icon: `FileChartColumn`) between Finance Reports and Announcements.

---

## Validation Results

| Step | Result |
|------|--------|
| `npx prisma validate` | ✅ |
| `npx prisma generate` | ✅ |
| `npx next typegen` | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ (0 errors, 0 warnings) |
| `npm run build` | ✅ (36 routes) |

---

## Runtime Status

- **PostgreSQL**: Unavailable (P1001) — no live query/export testing performed.
- **Storage provider**: Not configured — document uploads fail with an honest error; metadata layer ready.
- **Seeding**: No fake data added.

---

## Exclusions (per spec)

- ❌ Subscription billing
- ❌ SMS / email provider integration
- ❌ Mobile app
- ❌ New business modules

---

## Remaining Issues / Follow-ups

1. **Storage provider**: Wire a real backend (S3, Azure Blob, GCS, local disk) by implementing `StorageProvider.put/get/delete`.
2. **Document download**: Add a signed-URL download action once storage is configured.
3. **Report scheduling**: Consider background PDF generation for heavy reports if needed.
4. **Performance indexes**: Add composite indexes on `StudentDocument(schoolId, studentId, createdAt)` and `StudentDocument(schoolId, type)` (already present).