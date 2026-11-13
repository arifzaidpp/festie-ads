import { PLACEMENT_LABEL, UNIT_LABEL } from "@/lib/placements";
import {
  invoiceLines,
  minorToDecimal,
  priceRows,
  quantityLabel,
  toCsv,
  totalsByCurrency,
  type InvoiceLine,
  type PricedRow,
} from "./billing";
import { loadRates, loadStats, type ReportFilters, type StatRowWithFest } from "./reports";

export interface BillingReport {
  filters: ReportFilters;
  lines: InvoiceLine[];
  priced: Array<PricedRow & { festName: string }>;
  totals: Array<{ currency: string; amountMinor: number }>;
  /** Days with usage but no price in force: these are not billed. */
  unpricedRows: number;
  /** The range includes today, which is still counting. */
  includesToday: boolean;
}

export async function buildBilling(accountId: string, filters: ReportFilters, now = new Date()): Promise<BillingReport> {
  const [stats, rates] = await Promise.all([loadStats(accountId, filters, now), loadRates(accountId)]);
  const festBy = new Map<StatRowWithFest, string>(stats.map((s) => [s, s.festName]));
  const priced = priceRows(stats, rates).map((p, i) => ({ ...p, festName: festBy.get(stats[i]!) ?? "" }));
  const lines = invoiceLines(priced);
  return {
    filters,
    lines,
    priced: priced.filter((p) => p.quantity > 0),
    totals: totalsByCurrency(lines),
    unpricedRows: priced.filter((p) => p.quantity > 0 && !p.rate).length,
    includesToday: filters.to >= now.toISOString().slice(0, 10),
  };
}

/** `ad`: one line per sponsor, ad group, ad and price (what an invoice shows). `day`: one line per day and fest (the audit trail). */
export function billingCsv(report: BillingReport, level: "ad" | "day"): string {
  if (level === "day") {
    return toCsv([
      ["Date (UTC)", "Sponsor", "Account", "Fest", "Ad", "Placement", "Media", "Unit", "Quantity", "Price", "Currency", "Amount"],
      ...report.priced.map((p) => [
        p.date,
        p.sponsorName,
        p.accountName,
        p.festName,
        p.adTitle,
        PLACEMENT_LABEL[p.placement],
        p.mediaType,
        UNIT_LABEL[p.unit],
        quantityLabel(p.unit, p.quantity),
        p.rate ? minorToDecimal(p.rate.amountMinor) : "NO PRICE",
        p.rate?.currency ?? "",
        p.rate ? minorToDecimal(p.amountMinor) : "",
      ]),
    ]);
  }
  return toCsv([
    ["Period", "Sponsor", "Account", "Ad", "Placement", "Media", "Unit", "Quantity", "Price", "Currency", "Amount"],
    ...report.lines.map((l) => [
      `${report.filters.from} to ${report.filters.to}`,
      l.sponsorName,
      l.accountName,
      l.adTitle,
      PLACEMENT_LABEL[l.placement],
      l.mediaType,
      UNIT_LABEL[l.unit],
      quantityLabel(l.unit, l.quantity),
      l.rateMinor === null ? "NO PRICE" : minorToDecimal(l.rateMinor),
      l.currency ?? "",
      l.rateMinor === null ? "" : minorToDecimal(l.amountMinor),
    ]),
    ...report.totals.map((t) => ["", "", "", "", "", "", "", "", "Total", t.currency, minorToDecimal(t.amountMinor)]),
  ]);
}
