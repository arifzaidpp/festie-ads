/** Placements, media rules and units. Shared by the admin UI, the API and the serve API. */

export const PLACEMENTS = ["POSTER_FOOTER", "SCREEN_FOOTER", "SCREEN_FULLSCREEN"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const MEDIA_TYPES = ["IMAGE", "VIDEO"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const RATE_UNITS = ["PER_DOWNLOAD", "PER_HOUR_DISPLAYED", "PER_HOUR_WATCHED"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

/** The five sellable combinations. Video is never allowed in the poster footer. */
export const VALID_COMBOS: ReadonlyArray<{ placement: Placement; mediaType: MediaType }> = [
  { placement: "POSTER_FOOTER", mediaType: "IMAGE" },
  { placement: "SCREEN_FOOTER", mediaType: "IMAGE" },
  { placement: "SCREEN_FULLSCREEN", mediaType: "IMAGE" },
  { placement: "SCREEN_FOOTER", mediaType: "VIDEO" },
  { placement: "SCREEN_FULLSCREEN", mediaType: "VIDEO" },
];

export function isValidCombo(placement: Placement, mediaType: MediaType): boolean {
  return VALID_COMBOS.some((c) => c.placement === placement && c.mediaType === mediaType);
}

/** Billing unit of each combination. */
export function unitFor(placement: Placement, mediaType: MediaType): RateUnit {
  if (mediaType === "VIDEO") return "PER_HOUR_WATCHED";
  return placement === "POSTER_FOOTER" ? "PER_DOWNLOAD" : "PER_HOUR_DISPLAYED";
}

export const PLACEMENT_LABEL: Record<Placement, string> = {
  POSTER_FOOTER: "Poster footer",
  SCREEN_FOOTER: "Screen footer",
  SCREEN_FULLSCREEN: "Screen fullscreen",
};

export const UNIT_LABEL: Record<RateUnit, string> = {
  PER_DOWNLOAD: "per download",
  PER_HOUR_DISPLAYED: "per hour displayed",
  PER_HOUR_WATCHED: "per hour watched",
};

export interface PlacementSpec {
  /** Width / height range accepted. */
  ratio: { min: number; max: number };
  minWidth: number;
  /** Shown next to the upload field. */
  hint: string;
  /** Aspect ratio of the preview frame. */
  previewRatio: number;
}

// The screen canvas is 1920x1080 and the footer 1920x270 (festie screen-player.tsx).
export const PLACEMENT_SPECS: Record<Placement, PlacementSpec> = {
  POSTER_FOOTER: {
    ratio: { min: 3, max: 8 },
    minWidth: 800,
    hint: "Wide banner, 3:1 to 8:1, at least 800 px wide.",
    previewRatio: 6,
  },
  SCREEN_FOOTER: {
    ratio: { min: 6.9, max: 7.33 },
    minWidth: 960,
    hint: "1920 x 270 (about 32:4.5), at least 960 px wide.",
    previewRatio: 1920 / 270,
  },
  SCREEN_FULLSCREEN: {
    ratio: { min: 1.72, max: 1.83 },
    minWidth: 1280,
    hint: "16:9, for example 1920 x 1080, at least 1280 px wide.",
    previewRatio: 16 / 9,
  },
};

export const MEDIA_LIMITS = {
  IMAGE: {
    mimes: ["image/png", "image/jpeg", "image/webp"],
    maxBytes: 5 * 1024 * 1024,
  },
  VIDEO: {
    mimes: ["video/mp4"],
    maxBytes: 50 * 1024 * 1024,
    maxDurationMs: 60_000,
  },
} as const;

export const DISPLAY_SECONDS = { min: 3, max: 60, default: 10 } as const;

/** Null when the size fits the placement, else a message. */
export function checkDimensions(placement: Placement, width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return "Media has no size.";
  const spec = PLACEMENT_SPECS[placement];
  // Shape first: a portrait file should hear "wrong shape", not "too small".
  const ratio = width / height;
  if (ratio < spec.ratio.min || ratio > spec.ratio.max) {
    return `Wrong shape (${width} x ${height}): ${spec.hint}`;
  }
  if (width < spec.minWidth) return `Too small: ${spec.hint}`;
  return null;
}

/** Images on screens rotate for `displaySeconds`; every other combination has none. */
export function usesDisplaySeconds(placement: Placement, mediaType: MediaType): boolean {
  return mediaType === "IMAGE" && placement !== "POSTER_FOOTER";
}
