import { format } from "date-fns";

export function formatMoney(amount: number, currency: string): string {
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
    // Codes without a symbol are rendered as the raw code plus a non-breaking
    // space; normalize those to a plain "CODE 0.00" string.
    if (formatted.includes(currency)) return `${currency} ${amount.toFixed(2)}`;
    return formatted;
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy HH:mm");
}
