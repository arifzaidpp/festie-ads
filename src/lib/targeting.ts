/** Ad relevance: who an ad is for, and how well a viewer fits. Pure, no database. */

export const CATEGORIES = [
  "food",
  "electronics",
  "fashion",
  "education",
  "health",
  "finance",
  "travel",
  "automotive",
  "entertainment",
  "real_estate",
  "services",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food",
  electronics: "Electronics",
  fashion: "Fashion",
  education: "Education",
  health: "Health",
  finance: "Finance",
  travel: "Travel",
  automotive: "Automotive",
  entertainment: "Entertainment",
  real_estate: "Real estate",
  services: "Services",
  other: "Other",
};

export const DEVICES = ["tv", "desktop", "mobile", "tablet"] as const;
export type Device = (typeof DEVICES)[number];

export const TARGET_LIMITS = { items: 30, itemLength: 100, radiusKm: { min: 1, max: 5000 }, interests: 5 } as const;

export interface Radius {
  lat: number;
  lon: number;
  km: number;
}

export interface Viewer {
  country?: string;
  region?: string;
  city?: string;
  lat?: number;
  lon?: number;
  device?: Device;
  interests?: string[];
}

export interface Targeted {
  category?: string | null;
  targetCountries?: string[] | null;
  targetRegions?: string[] | null;
  targetCities?: string[] | null;
  targetRadius?: Radius | null;
  targetStrict?: boolean | null;
}

export const MULTIPLIER = { radius: 4, city: 4, region: 2.5, country: 1.5, interest: 2, mismatch: 0.25 } as const;

const norm = (v: string | undefined | null) => (v ?? "").trim().toLowerCase();
const has = (list: string[] | null | undefined, value: string | undefined) => {
  const v = norm(value);
  return v !== "" && (list ?? []).some((x) => norm(x) === v);
};

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function hasTargeting(ad: Targeted): boolean {
  return Boolean(ad.targetCountries?.length || ad.targetRegions?.length || ad.targetCities?.length || ad.targetRadius);
}

function knownLocation(v: Viewer): boolean {
  return Boolean(norm(v.country) || norm(v.region) || norm(v.city) || (isNum(v.lat) && isNum(v.lon)));
}
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Whether an ad may be shown to this viewer, and how much its pick weight is multiplied. */
export function scoreAd(ad: Targeted, viewer: Viewer): { eligible: boolean; multiplier: number } {
  let multiplier = 1;

  if (hasTargeting(ad)) {
    let match = 0;
    const r = ad.targetRadius;
    if (r && isNum(viewer.lat) && isNum(viewer.lon) && haversineKm(r.lat, r.lon, viewer.lat, viewer.lon) <= r.km) {
      match = Math.max(match, MULTIPLIER.radius);
    }
    if (has(ad.targetCities, viewer.city)) match = Math.max(match, MULTIPLIER.city);
    if (has(ad.targetRegions, viewer.region)) match = Math.max(match, MULTIPLIER.region);
    if (has(ad.targetCountries, viewer.country)) match = Math.max(match, MULTIPLIER.country);

    if (match > 0) multiplier = match;
    else if (ad.targetStrict) return { eligible: false, multiplier: 0 };
    else if (knownLocation(viewer)) multiplier = MULTIPLIER.mismatch;
  }

  if (ad.category && (viewer.interests ?? []).some((i) => norm(i) === norm(ad.category))) multiplier *= MULTIPLIER.interest;
  return { eligible: true, multiplier };
}
