import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { priceRates } from "@/db/schema";
import { VALID_COMBOS, unitFor, type MediaType, type Placement } from "@/lib/placements";

export interface CurrentRate {
  placement: Placement;
  mediaType: MediaType;
  amountMinor: number | null;
  currency: string | null;
  effectiveFrom: string | null;
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The rate in force on `onDate` for each of the five combinations (null when none is set yet). */
export async function getCurrentRates(accountId: string, onDate = todayUtc()): Promise<CurrentRate[]> {
  const rows = await getDb()
    .select()
    .from(priceRates)
    .where(eq(priceRates.accountId, accountId))
    .orderBy(desc(priceRates.effectiveFrom));
  return VALID_COMBOS.map((combo) => {
    const row = rows.find(
      (r) => r.placement === combo.placement && r.mediaType === combo.mediaType && r.effectiveFrom <= onDate,
    );
    return {
      ...combo,
      amountMinor: row?.amountMinor ?? null,
      currency: row?.currency ?? null,
      effectiveFrom: row?.effectiveFrom ?? null,
    };
  });
}

export function listRateHistory(accountId: string) {
  return getDb()
    .select()
    .from(priceRates)
    .where(eq(priceRates.accountId, accountId))
    .orderBy(desc(priceRates.effectiveFrom), priceRates.placement, priceRates.mediaType);
}

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

/** Sets all five prices from today (UTC). Saving twice on the same day replaces that day's rows. */
export async function setRates(
  ownerId: string,
  accountId: string,
  input: { currency: string; rates: { placement: Placement; mediaType: MediaType; amount: number }[] },
) {
  const effectiveFrom = todayUtc();
  await getDb()
    .insert(priceRates)
    .values(
      input.rates.map((r) => ({
        ownerId,
        accountId,
        placement: r.placement,
        mediaType: r.mediaType,
        unit: unitFor(r.placement, r.mediaType),
        amountMinor: toMinor(r.amount),
        currency: input.currency,
        effectiveFrom,
      })),
    )
    .onConflictDoUpdate({
      target: [priceRates.accountId, priceRates.placement, priceRates.mediaType, priceRates.effectiveFrom],
      set: { amountMinor: sql`excluded.amount_minor`, currency: sql`excluded.currency`, unit: sql`excluded.unit` },
    });
}
