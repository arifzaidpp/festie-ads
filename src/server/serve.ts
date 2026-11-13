import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adAccounts, ads, assets, connectionFests, connections } from "@/db/schema";
import { defaultLayout, type MediaLayout } from "@/lib/media-layout";
import type { MediaType, Placement } from "@/lib/placements";
import { scoreAd, type Viewer } from "@/lib/targeting";
import { assetUrl } from "./media";

export const SERVE_TTL_SECONDS = 60;

export interface ServedAd {
  id: string;
  media_type: MediaType;
  url: string;
  width: number;
  height: number;
  duration_ms: number | null;
  display_seconds: number | null;
  /** Videos are fitted in the frame by the player with this layout; images are already baked (null). */
  layout: MediaLayout | null;
  ttl_seconds: number;
}

/** Weighted random pick. `random` is injectable (0 <= r < 1) so the odds are testable. */
export function pickWeighted<T extends { weight: number }>(items: readonly T[], random: () => number = Math.random): T | null {
  if (items.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(0.01, item.weight), 0);
  let target = random() * total;
  for (const item of items) {
    target -= Math.max(0.01, item.weight);
    if (target < 0) return item;
  }
  return items[items.length - 1]!;
}

/**
 * The ad to show now for a connection (the ad account id is the external ref), placement and optionally a fest.
 * Eligible: ACTIVE ad in an ACTIVE account with an ACTIVE connection, inside its schedule, for the placement.
 * `exclude` is skipped when there is another choice, so rotation does not repeat the same ad.
 */
export async function serveAd(input: {
  accountId: string;
  subFestId?: string;
  placement: Placement;
  exclude?: string;
  /** Optional, lenient: unknown fields only make the pick less targeted. */
  viewer?: Viewer;
  now?: Date;
  random?: () => number;
}): Promise<ServedAd | null> {
  const db = getDb();
  const now = input.now ?? new Date();

  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .innerJoin(adAccounts, eq(adAccounts.id, connections.accountId))
    .where(and(eq(connections.accountId, input.accountId), eq(connections.status, "ACTIVE"), eq(adAccounts.status, "ACTIVE")));
  if (!connection) return null;

  if (input.subFestId) {
    const [fest] = await db
      .select({ id: connectionFests.subFestId })
      .from(connectionFests)
      .where(and(eq(connectionFests.connectionId, connection.id), eq(connectionFests.subFestId, input.subFestId)));
    if (!fest) return null;
  }

  const rows = await db
    .select({
      id: ads.id,
      weight: ads.weight,
      mediaType: ads.mediaType,
      displaySeconds: ads.displaySeconds,
      layout: ads.layout,
      category: ads.category,
      targetCountries: ads.targetCountries,
      targetRegions: ads.targetRegions,
      targetCities: ads.targetCities,
      targetRadius: ads.targetRadius,
      targetStrict: ads.targetStrict,
      key: assets.storageKey,
      width: assets.width,
      height: assets.height,
      durationMs: assets.durationMs,
    })
    .from(ads)
    .innerJoin(assets, eq(assets.id, ads.assetId))
    .where(
      and(
        eq(ads.accountId, input.accountId),
        eq(ads.placement, input.placement),
        eq(ads.status, "ACTIVE"),
        or(isNull(ads.startsAt), lte(ads.startsAt, now)),
        or(isNull(ads.endsAt), gt(ads.endsAt, now)),
        // Poster footers are image only, whatever the data says.
        input.placement === "POSTER_FOOTER" ? eq(ads.mediaType, "IMAGE") : sql`true`,
      ),
    );

  const viewer = input.viewer ?? {};
  const usable = rows
    .filter((r) => assetUrl(r.key))
    .flatMap((r) => {
      const { eligible, multiplier } = scoreAd(r, viewer);
      return eligible ? [{ ...r, weight: r.weight * multiplier }] : [];
    });
  const choices = input.exclude && usable.length > 1 ? usable.filter((r) => r.id !== input.exclude) : usable;
  const picked = pickWeighted(choices, input.random);
  if (!picked) return null;
  return {
    id: picked.id,
    media_type: picked.mediaType,
    url: assetUrl(picked.key)!,
    width: picked.width,
    height: picked.height,
    duration_ms: picked.durationMs,
    display_seconds: picked.displaySeconds,
    layout: picked.mediaType === "VIDEO" ? (picked.layout ?? defaultLayout(input.placement)) : null,
    ttl_seconds: SERVE_TTL_SECONDS,
  };
}
