import { z } from "zod";
import { HEX_COLOR, SCALE_RANGE } from "./media-layout";
import {
  DISPLAY_SECONDS,
  MEDIA_TYPES,
  PLACEMENTS,
  VALID_COMBOS,
  isValidCombo,
  usesDisplaySeconds,
} from "./placements";
import { CATEGORIES, TARGET_LIMITS } from "./targeting";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const sponsorInput = z.object({
  name: text(120),
  contactEmail: z
    .string()
    .trim()
    .email()
    .max(200)
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  notes: optionalText(2000),
});

export const adAccountInput = z.object({ name: text(120) });

export const ratesInput = z.object({
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()),
  rates: z
    .array(
      z.object({
        placement: z.enum(PLACEMENTS),
        mediaType: z.enum(MEDIA_TYPES),
        /** Major units, for example 1.25. */
        amount: z.number().min(0).max(1_000_000),
      }),
    )
    .refine(
      (rows) => rows.every((r) => isValidCombo(r.placement, r.mediaType)),
      "Video is not allowed in the poster footer.",
    )
    .refine(
      (rows) =>
        VALID_COMBOS.every((c) =>
          rows.some((r) => r.placement === c.placement && r.mediaType === c.mediaType),
        ),
      "All five prices are required.",
    ),
});

export const layoutInput = z.object({
  background: z.string().regex(HEX_COLOR, "Pick a colour."),
  scale: z.number().min(SCALE_RANGE.min).max(SCALE_RANGE.max),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
});

const targetList = z
  .array(z.string().trim().min(1).max(TARGET_LIMITS.itemLength))
  .max(TARGET_LIMITS.items);
const targetCountries = z.array(z.string().trim().regex(/^[A-Za-z]{2}$/, "Use 2-letter country codes.").transform((v) => v.toUpperCase())).max(TARGET_LIMITS.items);
export const radiusInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  km: z.number().min(TARGET_LIMITS.radiusKm.min).max(TARGET_LIMITS.radiusKm.max),
});

const adFields = z.object({
  title: text(160),
  sponsorId: z.uuid(),
  placement: z.enum(PLACEMENTS),
  mediaType: z.enum(MEDIA_TYPES),
  assetId: z.uuid(),
  sourceAssetId: z.uuid().nullable().optional(),
  layout: layoutInput.nullable().optional(),
  weight: z.number().int().min(1).max(100),
  displaySeconds: z.number().int().min(DISPLAY_SECONDS.min).max(DISPLAY_SECONDS.max).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  category: z.enum(CATEGORIES).nullable().optional(),
  targetCountries: targetCountries.optional(),
  targetRegions: targetList.optional(),
  targetCities: targetList.optional(),
  targetRadius: radiusInput.nullable().optional(),
  targetStrict: z.boolean().optional(),
});

/** Rules that do not need the database. The same ones are enforced again by CHECK constraints. */
export function adRuleErrors(ad: {
  placement: (typeof PLACEMENTS)[number];
  mediaType: (typeof MEDIA_TYPES)[number];
  displaySeconds?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}): string[] {
  const errors: string[] = [];
  if (!isValidCombo(ad.placement, ad.mediaType)) {
    errors.push("Video is not allowed in the poster footer.");
  }
  const needsSeconds = usesDisplaySeconds(ad.placement, ad.mediaType);
  if (needsSeconds && ad.displaySeconds == null) errors.push("Display seconds is required for images on screens.");
  if (!needsSeconds && ad.displaySeconds != null) errors.push("Display seconds only applies to images on screens.");
  if (ad.startsAt && ad.endsAt && ad.endsAt <= ad.startsAt) errors.push("End must be after start.");
  return errors;
}

// Defaults only on create: a PATCH that omits a field must leave it alone.
const baseAd = adFields.extend({
  weight: adFields.shape.weight.default(1),
  status: adFields.shape.status.default("DRAFT"),
});

export const adInput = baseAd.superRefine((ad, ctx) => {
  for (const message of adRuleErrors(ad)) ctx.addIssue({ code: "custom", message });
});

export const adPatchInput = adFields.partial();

export const presignInput = z.object({
  filename: text(200),
  contentType: z.string().trim().min(1).max(100),
  bytes: z.number().int().positive(),
});

export const completeInput = z.object({
  key: text(300),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  durationMs: z.number().int().positive().max(3_600_000).nullable().optional(),
});
