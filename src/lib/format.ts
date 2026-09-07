export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
  }).format(date);
}

/**
 * Format the local `<input type="datetime-local">` value (yyyy-MM-ddTHH:mm)
 * into a display-ready locale string, or fall back to the raw value.
 */
export function formatDatetimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date);
}

export function formatPeriod(startDate: Date, endDate: Date): string {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

/**
 * Format a money value against a school's currency. Falls back to USD when the
 * currency code is unknown/unavailable so rendering never throws.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string
): string {
  if (amount === null || amount === undefined) return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: "USD",
    }).format(value);
  }
}