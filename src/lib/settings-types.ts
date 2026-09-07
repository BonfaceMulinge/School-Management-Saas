/**
 * Shared types and defaults for school configuration preferences (Phase 12).
 * Kept free of server-only imports so both client forms and server actions can
 * use them. Stored values are plain JSON; `mergeSettings` layers saved values
 * over defaults so legacy schools without a SchoolSettings row still render
 * sensible values.
 */

export type AttendanceStatusItem = {
  id: string;
  label: string;
  color: string;
};

export type GradingPreferences = {
  passMark: number | null;
};

export type ReceiptNumbering = {
  prefix: string;
  padding: number;
  nextNumber: number;
  autoIncrement: boolean;
};

export type DefaultAcademicSettings = {
  termLengthDays: number;
};

export type NotificationPreferences = {
  announcement: boolean;
  message: boolean;
  feePayment: boolean;
  feeReminder: boolean;
  resultsPublished: boolean;
  attendanceAlert: boolean;
  schoolEvent: boolean;
};

export type CommunicationPreferences = {
  contactEmail: string;
  defaultAudience: string;
};

export type FinanceSettings = {
  invoicePrefix: string;
  receiptNote: string;
};

export const ONBOARDING_STEPS = 5;

export const ATTENDANCE_STATUS_DEFAULTS: AttendanceStatusItem[] = [
  { id: "PRESENT", label: "Present", color: "#16a34a" },
  { id: "ABSENT", label: "Absent", color: "#dc2626" },
  { id: "LATE", label: "Late", color: "#f59e0b" },
  { id: "EXCUSED", label: "Excused", color: "#64748b" },
];

export const GRADING_PREFERENCES_DEFAULTS: GradingPreferences = {
  passMark: 50,
};

export const RECEIPT_NUMBERING_DEFAULTS: ReceiptNumbering = {
  prefix: "REC",
  padding: 4,
  nextNumber: 1,
  autoIncrement: true,
};

export const DEFAULT_ACADEMIC_SETTINGS_DEFAULTS: DefaultAcademicSettings = {
  termLengthDays: 90,
};

export const NOTIFICATION_PREFERENCES_DEFAULTS: NotificationPreferences = {
  announcement: true,
  message: true,
  feePayment: true,
  feeReminder: true,
  resultsPublished: true,
  attendanceAlert: true,
  schoolEvent: true,
};

export const COMMUNICATION_PREFERENCES_DEFAULTS: CommunicationPreferences = {
  contactEmail: "",
  defaultAudience: "ALL",
};

export const FINANCE_SETTINGS_DEFAULTS: FinanceSettings = {
  invoicePrefix: "INV",
  receiptNote: "",
};

/**
 * A serialised SchoolSettings row as read from Prisma. All preference columns
 * are JSON; scalars carry the display preferences that remain readable.
 */
export type SchoolSettingsRow = {
  dateFormat: string;
  timeFormat: string;
  firstDayOfWeek: string;
  attendanceStatuses: unknown;
  gradingPreferences: unknown;
  receiptNumbering: unknown;
  defaultAcademicSettings: unknown;
  notificationPreferences: unknown;
  communicationPreferences: unknown;
  financeSettings: unknown;
};

export type SchoolSettingsValues = {
  dateFormat: string;
  timeFormat: string;
  firstDayOfWeek: string;
  attendanceStatuses: AttendanceStatusItem[];
  gradingPreferences: GradingPreferences;
  receiptNumbering: ReceiptNumbering;
  defaultAcademicSettings: DefaultAcademicSettings;
  notificationPreferences: NotificationPreferences;
  communicationPreferences: CommunicationPreferences;
  financeSettings: FinanceSettings;
};

function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Layer saved (possibly partial/legacy) settings over the defaults so every
 * consumer can safely read typed values. Unknown keys are discarded.
 */
export function mergeSchoolSettings(row?: SchoolSettingsRow | null): SchoolSettingsValues {
  if (!row) return defaultSchoolSettings();

  const attendance = row.attendanceStatuses as Partial<AttendanceStatusItem>[] | null;
  const grading = row.gradingPreferences as Partial<GradingPreferences> | null;
  const receipt = row.receiptNumbering as Partial<ReceiptNumbering> | null;
  const academic = row.defaultAcademicSettings as Partial<DefaultAcademicSettings> | null;
  const notification = row.notificationPreferences as Partial<NotificationPreferences> | null;
  const communication = row.communicationPreferences as Partial<CommunicationPreferences> | null;
  const finance = row.financeSettings as Partial<FinanceSettings> | null;

  return {
    dateFormat: asString(row.dateFormat, "MM/dd/yyyy"),
    timeFormat: row.timeFormat === "12h" ? "12h" : "24h",
    firstDayOfWeek: ["MONDAY", "SUNDAY", "SATURDAY"].includes(row.firstDayOfWeek)
      ? row.firstDayOfWeek
      : "MONDAY",
    attendanceStatuses:
      asArray<Partial<AttendanceStatusItem>>(attendance, []).length > 0
        ? asArray<Partial<AttendanceStatusItem>>(attendance, []).map((item, index) => ({
            id: asString(item.id, `STATUS_${index}`),
            label: asString(item.label, `Status ${index + 1}`),
            color: asString(item.color, "#64748b"),
          }))
        : ATTENDANCE_STATUS_DEFAULTS,
    gradingPreferences: {
      passMark: asNumber(grading?.passMark, GRADING_PREFERENCES_DEFAULTS.passMark ?? 50),
    },
    receiptNumbering: {
      prefix: asString(receipt?.prefix, RECEIPT_NUMBERING_DEFAULTS.prefix),
      padding: asNumber(receipt?.padding, RECEIPT_NUMBERING_DEFAULTS.padding),
      nextNumber: asNumber(receipt?.nextNumber, RECEIPT_NUMBERING_DEFAULTS.nextNumber),
      autoIncrement: asBoolean(receipt?.autoIncrement, RECEIPT_NUMBERING_DEFAULTS.autoIncrement),
    },
    defaultAcademicSettings: {
      termLengthDays: asNumber(
        academic?.termLengthDays,
        DEFAULT_ACADEMIC_SETTINGS_DEFAULTS.termLengthDays
      ),
    },
    notificationPreferences: {
      announcement: asBoolean(
        notification?.announcement,
        NOTIFICATION_PREFERENCES_DEFAULTS.announcement
      ),
      message: asBoolean(notification?.message, NOTIFICATION_PREFERENCES_DEFAULTS.message),
      feePayment: asBoolean(notification?.feePayment, NOTIFICATION_PREFERENCES_DEFAULTS.feePayment),
      feeReminder: asBoolean(
        notification?.feeReminder,
        NOTIFICATION_PREFERENCES_DEFAULTS.feeReminder
      ),
      resultsPublished: asBoolean(
        notification?.resultsPublished,
        NOTIFICATION_PREFERENCES_DEFAULTS.resultsPublished
      ),
      attendanceAlert: asBoolean(
        notification?.attendanceAlert,
        NOTIFICATION_PREFERENCES_DEFAULTS.attendanceAlert
      ),
      schoolEvent: asBoolean(notification?.schoolEvent, NOTIFICATION_PREFERENCES_DEFAULTS.schoolEvent),
    },
    communicationPreferences: {
      contactEmail: asString(
        communication?.contactEmail,
        COMMUNICATION_PREFERENCES_DEFAULTS.contactEmail
      ),
      defaultAudience: asString(
        communication?.defaultAudience,
        COMMUNICATION_PREFERENCES_DEFAULTS.defaultAudience
      ),
    },
    financeSettings: {
      invoicePrefix: asString(finance?.invoicePrefix, FINANCE_SETTINGS_DEFAULTS.invoicePrefix),
      receiptNote: asString(finance?.receiptNote, FINANCE_SETTINGS_DEFAULTS.receiptNote),
    },
  };
}

export function defaultSchoolSettings(): SchoolSettingsValues {
  return mergeSchoolSettings(null);
}

export const DATE_FORMAT_OPTIONS = [
  { value: "MM/dd/yyyy", label: "MM/dd/yyyy (US)" },
  { value: "dd/MM/yyyy", label: "dd/MM/yyyy (UK)" },
  { value: "yyyy-MM-dd", label: "yyyy-MM-dd (ISO)" },
  { value: "dd.MM.yyyy", label: "dd.MM.yyyy" },
];

export const TIME_FORMAT_OPTIONS = [
  { value: "24h", label: "24-hour (e.g. 14:30)" },
  { value: "12h", label: "12-hour (e.g. 2:30 PM)" },
];

export const FIRST_DAY_OPTIONS = [
  { value: "MONDAY", label: "Monday" },
  { value: "SUNDAY", label: "Sunday" },
  { value: "SATURDAY", label: "Saturday" },
];

export const AUDIENCE_OPTIONS = [
  { value: "ALL", label: "Everyone" },
  { value: "PARENTS", label: "Parents only" },
  { value: "TEACHERS", label: "Teachers only" },
];