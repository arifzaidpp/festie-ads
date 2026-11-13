/** Pricing math. Pure functions only, so every rule is unit tested. Money is integer minor units (cents). */
import { unitFor, type MediaType, type Placement, type RateUnit } from "@/lib/placements";

export const MS_PER_HOUR = 3_600_000;

export interface RateRow {
  placement: Placement;
  mediaType: MediaType;
  amountMinor: number;
  currency: string;
  /** `YYYY-MM-DD` (UTC): the rate applies from this day on. */
  effectiveFrom: string;
}

/** One ad on one UTC day in one fest, as rolled up. */
export interface StatRow {
  date: string;
  adId: string;
  adTitle: string;
  sponsorId: string;
  sponsorName: string;
  accountId: string;
  accountName: string;
  subFestId: string;
  placement: Placement;
  mediaType: MediaType;
  posterGenerated: number;
  posterDownloads: number;
  displayMs: number;
  watchMs: number;
  impressions: number;
}

export interface PricedRow extends StatRow {
  unit: RateUnit;
  /** Downloads, or milliseconds for the hourly units. */
  quantity: number;
  /** The price in force on `date`, or null when none was set yet (then the row is unpriced, amount 0). */
  rate: { amountMinor: number; currency: string; effectiveFrom: string } | null;
  /** This row alone, rounded to a minor unit. */
  amountMinor: number;
}

/** The rate in force on `date`: the latest one that started on or before it. */
export function rateOn(
  rates: readonly RateRow[],
  placement: Placement,
  mediaType: MediaType,
  date: string,
): RateRow | null {
  let best: RateRow | null = null;
  for (const r of rates) {
    if (r.placement !== placement || r.mediaType !== mediaType || r.effectiveFrom > date) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

/** What is billed for a row: downloads, displayed time or watched time, by the combination's unit. */
export function quantityOf(row: Pick<StatRow, "placement" | "mediaType" | "posterDownloads" | "displayMs" | "watchMs">): number {
  const unit = unitFor(row.placement, row.mediaType);
  if (unit === "PER_DOWNLOAD") return row.posterDownloads;
  return unit === "PER_HOUR_WATCHED" ? row.watchMs : row.displayMs;
}

/** `quantity` is downloads, or milliseconds for the hourly units. Rounded once to a minor unit. */
export function amountFor(unit: RateUnit, quantity: number, amountMinor: number): number {
  return Math.round(unit === "PER_DOWNLOAD" ? quantity * amountMinor : (quantity * amountMinor) / MS_PER_HOUR);
}

/** Prices each daily row with the rate of its own day, so a price change never rewrites history. */
export function priceRows(rows: readonly StatRow[], rates: readonly RateRow[]): PricedRow[] {
  return rows.map((row) => {
    const unit = unitFor(row.placement, row.mediaType);
    const quantity = quantityOf(row);
    const rate = rateOn(rates, row.placement, row.mediaType, row.date);
    return {
      ...row,
      unit,
      quantity,
      rate: rate ? { amountMinor: rate.amountMinor, currency: rate.currency, effectiveFrom: rate.effectiveFrom } : null,
      amountMinor: rate ? amountFor(unit, quantity, rate.amountMinor) : 0,
    };
  });
}

export interface InvoiceLine {
  sponsorId: string;
  sponsorName: string;
  accountId: string;
  accountName: string;
  adId: string;
  adTitle: string;
  placement: Placement;
  mediaType: MediaType;
  unit: RateUnit;
  quantity: number;
  /** null: no price was set for some or all of these days. */
  rateMinor: number | null;
  currency: string | null;
  amountMinor: number;
  unpricedQuantity: number;
}

/**
 * Invoice lines: one per sponsor, ad group, ad and price. Quantities of days that share a price are
 * added first and rounded once, so the line is exactly quantity x price. Days without a price are
 * kept apart (rate null) so nothing is silently dropped.
 */
export function invoiceLines(priced: readonly PricedRow[]): InvoiceLine[] {
  const lines = new Map<string, InvoiceLine>();
  for (const row of priced) {
    if (row.quantity === 0) continue;
    const key = [row.sponsorId, row.accountId, row.adId, row.rate?.amountMinor ?? "none", row.rate?.currency ?? ""].join("|");
    let line = lines.get(key);
    if (!line) {
      line = {
        sponsorId: row.sponsorId,
        sponsorName: row.sponsorName,
        accountId: row.accountId,
        accountName: row.accountName,
        adId: row.adId,
        adTitle: row.adTitle,
        placement: row.placement,
        mediaType: row.mediaType,
        unit: row.unit,
        quantity: 0,
        rateMinor: row.rate?.amountMinor ?? null,
        currency: row.rate?.currency ?? null,
        amountMinor: 0,
        unpricedQuantity: 0,
      };
      lines.set(key, line);
    }
    line.quantity += row.quantity;
    if (!row.rate) line.unpricedQuantity += row.quantity;
  }
  for (const line of lines.values()) {
    line.amountMinor = line.rateMinor === null ? 0 : amountFor(line.unit, line.quantity, line.rateMinor);
  }
  return [...lines.values()].sort(
    (a, b) =>
      a.sponsorName.localeCompare(b.sponsorName) ||
      a.accountName.localeCompare(b.accountName) ||
      a.adTitle.localeCompare(b.adTitle) ||
      (b.rateMinor ?? -1) - (a.rateMinor ?? -1),
  );
}

/** Totals per currency (an account normally has one). */
export function totalsByCurrency(lines: readonly InvoiceLine[]): Array<{ currency: string; amountMinor: number }> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.currency) continue;
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amountMinor);
  }
  return [...totals].map(([currency, amountMinor]) => ({ currency, amountMinor }));
}

/** Hours with 4 decimals for display units, a whole number for downloads. */
export function quantityLabel(unit: RateUnit, quantity: number): string {
  return unit === "PER_DOWNLOAD" ? String(quantity) : (quantity / MS_PER_HOUR).toFixed(4);
}

export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** RFC 4180 field. Also defuses spreadsheet formulas: a leading = + - @ is prefixed with a quote. */
export function csvField(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
