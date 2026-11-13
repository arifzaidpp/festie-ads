import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adAccounts, ads, assets, sponsors } from "@/db/schema";
import type { MediaLayout } from "@/lib/media-layout";
import { MEDIA_LIMITS, checkDimensions, type MediaType, type Placement } from "@/lib/placements";
import type { Category, Radius } from "@/lib/targeting";
import { adRuleErrors } from "@/lib/validation";
import { HttpError } from "./http";
import { assetUrl } from "./media";

export interface AdFields {
  title: string;
  accountId: string;
  sponsorId: string;
  placement: Placement;
  mediaType: MediaType;
  assetId: string;
  sourceAssetId?: string | null;
  layout?: MediaLayout | null;
  weight: number;
  displaySeconds?: number | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  startsAt?: Date | null;
  endsAt?: Date | null;
  category?: Category | null;
  targetCountries?: string[];
  targetRegions?: string[];
  targetCities?: string[];
  targetRadius?: Radius | null;
  targetStrict?: boolean;
}

/**
 * Messages for how an ad fits its media file. Pure, so it is unit tested. Images are baked to the exact
 * frame size by the editor, so their size is checked; a video keeps its own size and is fitted in the frame
 * by the player, so only its length counts.
 */
export function assetErrors(
  ad: Pick<AdFields, "placement" | "mediaType">,
  asset: { kind: MediaType; width: number; height: number; durationMs: number | null },
): string[] {
  const errors: string[] = [];
  if (asset.kind !== ad.mediaType) errors.push(`The file is ${asset.kind.toLowerCase()}, but the ad is set to ${ad.mediaType.toLowerCase()}.`);
  if (asset.kind === "IMAGE") {
    const dims = checkDimensions(ad.placement, asset.width, asset.height);
    if (dims) errors.push(dims);
  }
  if (asset.kind === "VIDEO" && (asset.durationMs ?? 0) > MEDIA_LIMITS.VIDEO.maxDurationMs) {
    errors.push(`Videos can be at most ${MEDIA_LIMITS.VIDEO.maxDurationMs / 1000} seconds.`);
  }
  return errors;
}

async function loadOwned(ownerId: string, fields: AdFields) {
  const db = getDb();
  const [[account], [sponsor], [asset]] = await Promise.all([
    db.select().from(adAccounts).where(and(eq(adAccounts.id, fields.accountId), eq(adAccounts.ownerId, ownerId))),
    db.select().from(sponsors).where(and(eq(sponsors.id, fields.sponsorId), eq(sponsors.accountId, fields.accountId))),
    db.select().from(assets).where(and(eq(assets.id, fields.assetId), eq(assets.ownerId, ownerId))),
  ]);
  if (!account) throw new HttpError(404, "Ad account not found.");
  if (!sponsor) throw new HttpError(404, "Sponsor not found.");
  if (!asset) throw new HttpError(404, "Media file not found.");
  if (fields.sourceAssetId) {
    const [source] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, fields.sourceAssetId), eq(assets.ownerId, ownerId)));
    if (!source) throw new HttpError(404, "Source media not found.");
  }
  if (account.status === "ARCHIVED" && fields.status !== "ARCHIVED") throw new HttpError(409, "This ad account is archived.");
  return { account, sponsor, asset };
}

function validateAll(fields: AdFields, asset: Parameters<typeof assetErrors>[1]) {
  const errors = [...adRuleErrors(fields), ...assetErrors(fields, asset)];
  if (errors.length) throw new HttpError(422, errors.join(" "));
}

export async function listAds(accountId: string) {
  const rows = await getDb()
    .select({ ad: ads, sponsorName: sponsors.name, assetKey: assets.storageKey })
    .from(ads)
    .innerJoin(sponsors, eq(sponsors.id, ads.sponsorId))
    .innerJoin(assets, eq(assets.id, ads.assetId))
    .where(eq(ads.accountId, accountId))
    .orderBy(desc(ads.createdAt));
  return rows.map((r) => ({ ...r.ad, sponsorName: r.sponsorName, mediaUrl: assetUrl(r.assetKey) }));
}

export async function getAd(accountId: string, id: string) {
  const [row] = await getDb()
    .select({ ad: ads, asset: assets })
    .from(ads)
    .innerJoin(assets, eq(assets.id, ads.assetId))
    .where(and(eq(ads.id, id), eq(ads.accountId, accountId)));
  if (!row) throw new HttpError(404, "Ad not found.");
  return { ...row.ad, asset: { ...row.asset, url: assetUrl(row.asset.storageKey) } };
}

export async function createAd(ownerId: string, fields: AdFields) {
  const { asset } = await loadOwned(ownerId, fields);
  validateAll(fields, asset);
  const [row] = await getDb()
    .insert(ads)
    .values({
      ...fields,
      ownerId,
      displaySeconds: fields.displaySeconds ?? null,
      sourceAssetId: fields.sourceAssetId ?? null,
      layout: fields.layout ?? null,
      category: fields.category ?? null,
      targetRadius: fields.targetRadius ?? null,
    })
    .returning();
  return row!;
}

export async function updateAd(ownerId: string, accountId: string, id: string, patch: Partial<Omit<AdFields, "accountId">>) {
  const current = await getAd(accountId, id);
  const merged: AdFields = {
    title: patch.title ?? current.title,
    accountId,
    sponsorId: patch.sponsorId ?? current.sponsorId,
    placement: patch.placement ?? current.placement,
    mediaType: patch.mediaType ?? current.mediaType,
    assetId: patch.assetId ?? current.assetId,
    sourceAssetId: patch.sourceAssetId !== undefined ? patch.sourceAssetId : current.sourceAssetId,
    layout: patch.layout !== undefined ? patch.layout : current.layout,
    weight: patch.weight ?? current.weight,
    displaySeconds: patch.displaySeconds !== undefined ? patch.displaySeconds : current.displaySeconds,
    status: patch.status ?? current.status,
    startsAt: patch.startsAt !== undefined ? patch.startsAt : current.startsAt,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : current.endsAt,
    category: patch.category !== undefined ? patch.category : ((current.category as Category | null) ?? null),
    targetCountries: patch.targetCountries ?? current.targetCountries,
    targetRegions: patch.targetRegions ?? current.targetRegions,
    targetCities: patch.targetCities ?? current.targetCities,
    targetRadius: patch.targetRadius !== undefined ? patch.targetRadius : current.targetRadius,
    targetStrict: patch.targetStrict ?? current.targetStrict,
  };
  const { asset } = await loadOwned(ownerId, merged);
  validateAll(merged, asset);
  const [row] = await getDb()
    .update(ads)
    .set({
      ...merged,
      displaySeconds: merged.displaySeconds ?? null,
      sourceAssetId: merged.sourceAssetId ?? null,
      layout: merged.layout ?? null,
      category: merged.category ?? null,
      targetRadius: merged.targetRadius ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(ads.id, id), eq(ads.accountId, accountId)))
    .returning();
  return row!;
}

/** Ads are archived, never deleted: past events and billing still point at them. */
export function archiveAd(ownerId: string, accountId: string, id: string) {
  return updateAd(ownerId, accountId, id, { status: "ARCHIVED" });
}
