/**
 * Email templates (Phase 15). Pure rendering — no database/network. Content is
 * built from caller-supplied variables (school names, amounts, references).
 * `{{key}}` placeholders are substituted once; each template also exposes a
 * `requires` list so callers can validate that required variables are present
 * before sending.
 */

export type EmailTemplateKey =
  | "welcome"
  | "account"
  | "payment-receipt"
  | "subscription-activated"
  | "subscription-renewed"
  | "fee-reminder"
  | "announcement";

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
  requires: string[];
};

export const EMAIL_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  welcome: {
    subject: "Welcome to your school platform",
    html:
      "<h2>Welcome, {{recipientName}}!</h2>" +
      "<p>Your account has been created on the school management platform.</p>" +
      "<p>Log in to get started.</p>",
    text: "Welcome, {{recipientName}}! Your account has been created on the school management platform.",
    requires: ["recipientName"],
  },
  account: {
    subject: "Your school account",
    html: "<h2>Account notice</h2><p>Dear {{recipientName}},</p><p>{{message}}</p>",
    text: "Dear {{recipientName}}, {{message}}",
    requires: ["recipientName", "message"],
  },
  "payment-receipt": {
    subject: "Payment receipt",
    html:
      "<h2>Payment received</h2>" +
      "<p>{{schoolName}} has received a payment of <strong>{{currency}} {{amount}}</strong>.</p>" +
      "<p>Reference: {{reference}}</p><p>Thank you.</p>",
    text: "Payment of {{currency}} {{amount}} received by {{schoolName}}. Reference: {{reference}}.",
    requires: ["schoolName", "currency", "amount", "reference"],
  },
  "subscription-activated": {
    subject: "Your subscription is active",
    html:
      "<h2>Subscription activated</h2>" +
      "<p>Hi {{schoolName}},</p>" +
      "<p>Your platform subscription is now active. Amount: <strong>{{currency}} {{amount}}</strong>.</p>",
    text: "Your platform subscription is now active. Amount: {{currency}} {{amount}}.",
    requires: ["schoolName", "currency", "amount"],
  },
  "subscription-renewed": {
    subject: "Your subscription was renewed",
    html:
      "<h2>Subscription renewed</h2>" +
      "<p>Hi {{schoolName}},</p>" +
      "<p>Your platform subscription has been renewed. Amount: <strong>{{currency}} {{amount}}</strong>.</p>",
    text: "Your platform subscription has been renewed. Amount: {{currency}} {{amount}}.",
    requires: ["schoolName", "currency", "amount"],
  },
  "fee-reminder": {
    subject: "Fee payment reminder",
    html:
      "<h2>Fee reminder</h2>" +
      "<p>Dear {{recipientName}},</p>" +
      "<p>An outstanding balance of <strong>{{currency}} {{amount}}</strong> is due for <strong>{{studentName}}</strong>.</p>",
    text: "Fee reminder: {{currency}} {{amount}} is due for {{studentName}}.",
    requires: ["recipientName", "currency", "amount", "studentName"],
  },
  announcement: {
    subject: "{{subject}}",
    html: "<h2>{{subject}}</h2><p>{{body}}</p>",
    text: "{{subject}}\n{{body}}",
    requires: ["subject", "body"],
  },
};

/**
 * Substitute `{{key}}` placeholders from `vars`. Unknown keys stay unchanged so
 * a missing variable never silently corrupts an outbound message.
 */
export function renderTemplate(
  text: string,
  vars: Record<string, string | number>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

/** Render an email template and check that required variables are supplied. */
export function renderEmail(
  key: EmailTemplateKey,
  vars: Record<string, string | number>
): { ok: true; template: EmailTemplate } | { ok: false; missing: string[] } {
  const base = EMAIL_TEMPLATES[key];
  const missing = base.requires.filter((r) => vars[r] === undefined);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return {
    ok: true,
    template: {
      subject: renderTemplate(base.subject, vars),
      html: renderTemplate(base.html, vars),
      text: renderTemplate(base.text, vars),
      requires: base.requires,
    },
  };
}