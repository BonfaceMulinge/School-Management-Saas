/**
 * SMS templates (Phase 15). Pure rendering. `{{key}}` placeholders are
 * substituted from caller-provided variables; unknown keys stay unchanged.
 * SMS is deliberately terse and never contains secrets or full payment data.
 */

export type SmsTemplateKey =
  | "fee-reminder"
  | "payment-confirmation"
  | "announcement"
  | "account";

export const SMS_TEMPLATES: Record<SmsTemplateKey, string> = {
  "fee-reminder": "Reminder: {{currency}} {{amount}} is outstanding for {{studentName}} at {{schoolName}}.",
  "payment-confirmation": "{{schoolName}}: payment of {{currency}} {{amount}} received. Thank you.",
  announcement: "{{schoolName}}: {{body}}",
  account: "{{schoolName}}: {{message}}",
};

export function renderSms(
  key: SmsTemplateKey,
  vars: Record<string, string | number>
): string {
  const template = SMS_TEMPLATES[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, k: string) =>
    k in vars ? String(vars[k]) : match
  );
}