const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

const ADJUSTMENT_LABELS: Record<string, string> = {
  DISCOUNT: "Discount",
  WAIVER: "Waiver",
  ADJUSTMENT: "Adjustment",
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Applied",
  REVERSED: "Reversed",
};

export function paymentMethodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

export function adjustmentTypeLabel(type: string): string {
  return ADJUSTMENT_LABELS[type] ?? type;
}

export function paymentStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}