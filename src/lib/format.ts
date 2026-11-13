import { MS_PER_HOUR } from "@/server/billing";

export function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Hours with 2 decimals; "0" when nothing. */
export function formatHours(ms: number): string {
  return ms === 0 ? "0" : (ms / MS_PER_HOUR).toFixed(2);
}
