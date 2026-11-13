import { CATEGORIES, DEVICES, TARGET_LIMITS, type Device, type Viewer } from "./targeting";

function text(v: string | null, max = 100): string | undefined {
  const t = v?.trim();
  return t ? t.slice(0, max) : undefined;
}

function coord(v: string | null, limit: number): number | undefined {
  if (v == null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

/** Viewer from serve query params. Lenient: a bad value is dropped, never an error. */
export function viewerFromParams(params: URLSearchParams): Viewer {
  const viewer: Viewer = {};
  const country = text(params.get("country"));
  if (country && /^[a-z]{2}$/i.test(country)) viewer.country = country.toUpperCase();
  const region = text(params.get("region"));
  if (region) viewer.region = region;
  const city = text(params.get("city"));
  if (city) viewer.city = city;
  const lat = coord(params.get("lat"), 90);
  const lon = coord(params.get("lon"), 180);
  if (lat !== undefined && lon !== undefined) Object.assign(viewer, { lat, lon });
  const device = params.get("device")?.trim().toLowerCase();
  if (device && (DEVICES as readonly string[]).includes(device)) viewer.device = device as Device;
  const interests = [
    ...new Set(
      (params.get("interests") ?? "")
        .split(",")
        .map((i) => i.trim().toLowerCase())
        .filter((i) => (CATEGORIES as readonly string[]).includes(i)),
    ),
  ].slice(0, TARGET_LIMITS.interests);
  if (interests.length) viewer.interests = interests;
  return viewer;
}
