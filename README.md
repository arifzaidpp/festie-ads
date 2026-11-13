# Festie Ads

Self-serve ads for festie fests. Plan: [PLAN.md](PLAN.md).

## Run locally

```bash
pnpm install
cp .env.example .env   # set DATABASE_URL (Neon pooled URL)
pnpm db:migrate
pnpm dev
```

`GET /api/health` returns 200 when the app and database are up, 503 otherwise. Without `DATABASE_URL` it returns 200 `db: not_configured` in development and 503 in production.

## Scripts

| Script | Does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest |
| `pnpm db:generate` | New migration from `src/db/schema.ts` |
| `pnpm db:check` | Validate migration history |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |

## Deploy (Vercel Pro)

Import the folder as a project, set `DATABASE_URL`, run `pnpm db:migrate` against Neon before the first deploy.

## Ad accounts

After sign-in a user with no ad account is asked to create one (a name, like creating an event in a coupon app); then they connect it with Festie from **Settings**. One account per festival. Sponsors, prices, ads, analytics and billing belong to the **active** account, chosen with the picker at the top of the sidebar (cookie `fa_account`, always checked against the owner). In the database an account is still the `ad_groups` table (`group_id` columns): only the name in the app changed.

## Connecting to festie

Register the app in festie Control (Apps): callback URL `${BETTER_AUTH_URL}/api/festie/callback`, then set `FESTIE_ADMIN_URL` (festie admin origin), `FESTIE_API_URL` (festie API origin), `FESTIE_CLIENT_ID`, `FESTIE_CLIENT_SECRET` and `APP_ENCRYPTION_KEY`. In the app, open **Settings** of an ad account and press **Connect with Festie**: festie shows its consent page (festival and fests), sends the browser back with a one-time code, and the server exchanges it for a token (stored encrypted). `external_ref` is the ad account id. **Refresh** re-reads the festival and fests; a 401 from festie marks the connection **Disconnected**.

No festie running? Use the stand-in, which auto-approves consent:

```bash
MOCK_REDIRECT=http://localhost:3100/api/festie/callback node scripts/mock-festie.mjs
FESTIE_ADMIN_URL=http://localhost:4900 FESTIE_API_URL=http://localhost:4900 FESTIE_CLIENT_ID=mock-client FESTIE_CLIENT_SECRET=mock-secret pnpm dev
```

`POST http://localhost:4900/__revoke` simulates festie revoking, `POST /__fests` changes the fest list.

## Media storage (S3-compatible, Wasabi)

Set `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_PUBLIC_BASE_URL` and optionally `S3_KEY_PREFIX` (see `.env.example`). Festie's Wasabi public bucket is used, with every key under `festie-ads/<user id>/`. The bucket needs public read for the base URL and a CORS rule that allows `PUT` with `Content-Type` from the app origin (the browser uploads straight to the bucket). Uploads use a presigned URL (`POST /api/media/presign`), then `POST /api/media/complete` checks the stored file and records its real size. Without these variables the presign route returns 503.

## Media rules

| Placement | Media | Shape |
|---|---|---|
| Poster footer | image only | 3:1 to 8:1, 800 px wide or more |
| Screen footer | image or video | 1920 x 270 (about 32:4.5), 960 px wide or more |
| Screen fullscreen | image or video | 16:9, 1280 px wide or more |

Images: PNG, JPEG, WebP up to 5 MB. Video: MP4 up to 50 MB and 60 s. Video in the poster footer is rejected in the form, the API, and by a database CHECK constraint.

## Ad editor

Every media file sits in a fixed frame (poster footer 1800 x 300, screen footer 1920 x 270, fullscreen 1920 x 1080). On upload the editor opens: pick a background colour, set the size (Fit, Fill or any 10 to 400 %) and drag or slide to position. **Images** are baked in the browser to a JPEG of exactly the frame size, so the poster exporter and the screens need no change; the original is kept as `source_asset_id` so *Edit* can start from it later. **Videos** keep their file; the layout (`ads.layout`: background, scale, x, y) is returned by `serve` and festie's player fits the video in the frame with the same maths (`src/lib/media-layout.ts` here, `videoBox` in the public website). A video's own size is not checked.

Status is set by buttons, not a list: **Save** keeps the status (a new ad is a draft), **Publish** makes it `ACTIVE`, **Archive** hides it for good from serving (it can be published again).

## Usage events and rollup

Festie reports usage with a signed `POST /api/v1/events` (same headers as serve; the signature covers the raw body): `{ external_ref, events: [{ id, ad_id, kind, placement, sub_fest_id, value, session_id, occurred_at }], context?: { screen, geo: { country, region, city, lat, lon }, device: { type, os, browser } } }`, at most 100 per call, answer `202 { accepted, duplicates, rejected: [{ id, reason }] }`. `id` is the idempotency key. Kinds: `SCREEN_DISPLAY_MS` (a beat of 1 to 20 000 ms), `VIDEO_WATCH_MS` (video ads only), `POSTER_GENERATED` / `POSTER_DOWNLOADED` (poster footer only; `value` is the number of poster files, default 1, max 5000). An event is rejected when the ad is not in the connection's account, is a draft, has another placement, the fest is not connected (`-` means a screen of the whole festival), the kind does not fit, or it is older than 24 h or more than 5 min in the future.

`GET /api/cron/rollup` (Vercel Cron, 00:10 UTC, `Authorization: Bearer $CRON_SECRET`) rebuilds `ad_daily_stats` for the last two UTC days from the raw events, then refreshes every active festie connection. It is safe to run again; `?date=YYYY-MM-DD` backfills one day. An impression is a session with at least 5 s displayed that day.

## Analytics and billing

`/analytics` and `/billing` take the same filters in the URL: `from`, `to` (UTC, default last 30 days, max 366), `sponsorId`, `adId`, `placement`, `subFestId`; analytics adds `country` and `deviceType`. JSON: `GET /api/analytics`, `GET /api/billing`.

Analytics shows impressions, hours shown and watched, screens, countries, places and poster counts, per day and per hour of day (UTC), and ranked lists by country, state or region, city, exact place (about 1 km, with a map link), screen, fest, device, system, browser, ad and placement. Each list has a CSV (`GET /api/analytics/export.csv?dim=country|region|city|place|screen|fest|device|os|browser|placement|ad|hour|day`). It reads `ad_daily_breakdown`, rebuilt with `ad_daily_stats` by the rollup (an impression is counted once, where the session started); billing never reads it. Place and device come from the optional `context` of the events: festie fills them from the visitor's CDN location headers and user agent and never sends an IP. Poster events carry no place, and events from before this release show as Unknown. Billing CSV: `GET /api/billing/export.csv`, `level=ad` (default, invoice lines) or `level=day` (one row per day and fest, the audit trail).

Billing is computed, never stored: each daily row of `ad_daily_stats` is priced with the rate whose `effective_from` is the latest on or before that day, so a price change never rewrites history. Units: poster footer per download, image per hour displayed, video per hour watched. Invoice lines add the days that share a price and round once to a cent, so a line is exactly quantity x price. A day with usage but no price in force is shown as "No price" and is not billed. Fields starting with `= + - @` are quoted in the CSV so a spreadsheet never runs them. A range that includes today rebuilds today's rows from the raw events first, so today is current but partial.

Operations, limits and troubleshooting: [docs/runbook.md](docs/runbook.md).

## Design

The UI follows festie's design system (`docs/design-system.md` in the festie repo): tokens copied into `src/app/globals.css` (Plus Jakarta Sans, `bg-shell` rail and inset, `panel-card`, `text-2xs`…`text-3xl`, `rounded-2xl` panels, `tracking-caps` micro labels), shared components in `src/components/ui` (Button, Field/Input/Select, Panel, PageHeader, StatusBadge, StatCard, EmptyState, FeedbackBanner, Table/RecordCard) and a responsive shell (left rail from `md`, header plus bottom tab bar with a "More" sheet on phones). Components use tokens only: no hex, no px, no arbitrary values. Tables become stacked cards below `md`.

## Relevance

`serve` picks by relevance, not only weight. Effective pick weight = `ad.weight x multiplier`. Optional viewer query params (part of the signed path+query; bad values are ignored, never a 4xx): `country` (ISO2), `region`, `city`, `lat` + `lon` (both needed), `device` (`tv|desktop|mobile|tablet`), `interests` (comma list of categories, max 5). The response shape is unchanged.

An ad has a `category` (food, electronics, fashion, education, health, finance, travel, automotive, entertainment, real_estate, services, other) and targeting: countries, regions, cities, a radius `{lat, lon, km}`, and `target_strict`. Empty targeting shows everywhere.

| Case | Multiplier |
|---|---|
| No targeting | 1 |
| Viewer inside radius (haversine) or city match | 4 |
| Region match | 2.5 |
| Country match | 1.5 |
| Targeting set, viewer location known, no match | 0.25 |
| Targeting set, viewer location unknown | 1 |
| Ad `category` in viewer `interests` | x2 on top |

Strongest matching level wins; text compares case-insensitive and trimmed. **Strict**: an ad with targeting that does not match (or whose viewer location is unknown) is not served at all.
