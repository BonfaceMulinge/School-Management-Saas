const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  REPORT_CARD: "Report card",
  RECEIPT: "Receipt",
  STATEMENT: "Statement",
  CONSENT_FORM: "Consent form",
  MEDICAL: "Medical",
  TRANSCRIPT: "Transcript",
  OTHER: "Other",
};

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}