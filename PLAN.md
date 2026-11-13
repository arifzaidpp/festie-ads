# Festie Ads: MVP plan

> Update: "ad groups" became **ad accounts** (created after sign-in, connected with Festie from Settings; sponsors, prices and ads belong to the account), ad status is set with Save / Publish / Archive buttons, media is placed in a fixed frame by an editor, and analytics has place, screen and device breakdowns. See README.

Status: draft for approval. No code is written until PLAN.md is approved.

## 1. Context

Festie organizers want to show their own and their sponsors' ads on their fests (screens and posters) and bill each sponsor from tracked usage.
Festie Ads is a **separate, self-serve app on the festie app platform**, like the food app: a festie user signs up on Festie Ads, creates **ad groups**, connects each group to **one festival + chosen fests** through "Connect with Festie", and manages sponsors, ads, prices, analytics and billing.
Festie only serves and reports; it holds no ad data. Festie-run ads across all products is **out of scope** (later: a special account on the same engine).

Findings that shape the design (from festie.app, verified in code):
- Connection model exists: `App` / `AppConnection` / `AppConnectionSubFest`, consent page `/apps/connect`, code→token at `POST /apps/oauth/token`, HMAC-SHA256 signing helper (`signWebhook` in `apps/api/src/modules/app-platform/services/app-webhook-http.ts`), app contract in `packages/shared/src/app-platform.ts`. It is **read-only, app-pulls-festie**; ads need festie→app calls, which is the new part.
- Screen footer: `screen-player.tsx` reserves `AD_HEIGHT = 270px` (25% of 1920x1080) when a scene has `settings.showAd`, drawing a text "Ad" box. Fullscreen: scene type `AD` renders `scenes/ad-placeholder.tsx`. Both are stubs.
- Posters are rendered by the Go exporter (`apps/exporter/internal/exporter/`, headless Chromium, `renderJPG` / `renderJPGZip` / PDF). The exporter PUBLISHes job updates to Redis; the API listens (`template-export-events.service.ts` in api-core). Downloads go through `GeneratedDocumentDownloadController` (zip ticket) and public routes (`result-poster-downloads/:jobId/file`, `poster-documents/:documentId/file`).

## 2. MVP scope

**In**
- Accounts (email+password), sponsors, ad groups, ads, media upload, price table, schedules, weights.
- Connect an ad group to a festival and its fests; detect revoke.
- Serve API (image/video rules enforced), events API, nightly rollup.
- Analytics and billing report (CSV) per sponsor / ad group / ad / placement / date.
- Festie integration: screen footer, screen fullscreen, poster footer (baked into the file), fail-open.

**Out (later)**: festie-owned ad network, marketplace/revenue share, invoices/payments/tax, teams per account, per-ad fest narrowing, targeting by country, budgets/caps, daily time windows, click tracking, A/B, PDF poster footer if posters are never PDF, multi-currency, platform fee, other client apps (schema is ready via `client_apps`).

## 3. Final stack

Next.js 15 App Router + TypeScript on Vercel **Pro** (Hobby bars commercial use and limits cron) · Neon Postgres · Drizzle ORM + drizzle-kit migrations · Better Auth (email+password) · **Wasabi** (festie's existing S3-compatible bucket, own key prefix `festie-ads/`) for media, behind a provider-neutral `S3_*` config so R2 can replace it later · Vercel Cron nightly rollup · zod validation · Tailwind + shadcn/ui · Vitest. No Redis, queues or microservices.
Folder: recommend renaming `festie ads` → `festie-ads` (space in path); your call.

## 4. Data model (Drizzle, Postgres)

| Table | Key columns |
|---|---|
| Better Auth tables | `user`, `session`, `account`, `verification` (generated) |
| `client_apps` | `id`, `key` (`festie`), `admin_url`, `api_url`, `client_id`, `client_secret_enc`, `signing_secret_enc` (one row now, kept in step with env; more apps later) |
| `sponsors` | `id`, `owner_id`, `name`, `contact_email`, `notes` |
| `price_rates` | `id`, `owner_id`, `placement`, `media_type`, `unit`, `amount_minor`, `currency`, `effective_from`; check: only the 5 valid placement×media pairs |
| `ad_groups` | `id`, `owner_id`, `name`, `client_app_id`, `status` |
| `connections` | `id`, `group_id` unique (the group id is the `external_ref` sent to festie), `festival_id`, `festival_name`, `token_enc`, `status` (`ACTIVE`/`REVOKED`), `connected_at`; unique `(owner_id, festival_id)` |
| `connection_fests` | `connection_id`, `sub_fest_id`, `name` (refreshed from `GET /app-api/v1/connection`) |
| `assets` | `id`, `owner_id`, `kind` (image/video), `storage_key`, `mime`, `bytes`, `width`, `height`, `duration_ms` |
| `ads` | `id`, `group_id`, `sponsor_id`, `title`, `placement` (`POSTER_FOOTER`/`SCREEN_FOOTER`/`SCREEN_FULLSCREEN`), `media_type`, `asset_id`, `weight`, `display_seconds` (images on screens), `status`, `starts_at`, `ends_at`; **check: not (POSTER_FOOTER and video)** |
| `ad_events` (raw, 60-day retention) | `id`, `idempotency_key` unique, `connection_id`, `ad_id`, `sub_fest_id`, `placement`, `media_type`, `kind`, `value`, `session_id`, `occurred_at`, `received_at` |
| `ad_daily_stats` | PK `(date_utc, ad_id, sub_fest_id)`; `placement`, `media_type`, `poster_generated`, `poster_downloads`, `display_ms`, `watch_ms`, `impressions` |
| `rollup_runs` | `date_utc`, `status`, `finished_at` (idempotent cron) |

Billing is **computed from `ad_daily_stats` × the `price_rates` row effective on that date**, so a price change never rewrites history.
Event kinds: `POSTER_GENERATED`, `POSTER_DOWNLOADED`, `SCREEN_DISPLAY_MS`, `VIDEO_WATCH_MS`.

## 5. API

**Festie → engine** (server to server). Headers: `X-Ads-App: festie`, `X-Ads-Timestamp`, `X-Ads-Signature = base64(HMAC_SHA256(signingSecret, "<ts>.<body>"))`, 5-minute skew, reuses festie's existing signing scheme. The connection is identified by `external_ref`.
- `GET /api/v1/serve?external_ref&sub_fest_id&placement&exclude=<adId>` → `200 { ad: { id, media_type, url, width, height, display_seconds?, ttl_seconds } }` or `{ ad: null }`. Weighted rotation among ads that are active, inside their schedule, in a group with an ACTIVE connection that includes the fest, and match the placement. `POSTER_FOOTER` never returns video (and rejects `media_types=video` with 422).
- `POST /api/v1/events` body `{ events: [{ id, ad_id, kind, sub_fest_id, value, session_id, occurred_at }] }` → `202 { accepted, duplicates, rejected: [{id, reason}] }`. Max 100 events per call.

**Account → engine** (Better Auth session): `/api/auth/*`; `/api/festie/connect?group_id` (redirect to festie `/apps/connect?client_id&redirect_uri&state&external_ref&external_name`); `/api/festie/callback?code&state` (exchange code, save connection, redirect); then tRPC-style route handlers or server actions for CRUD of sponsors, groups, ads, rates, `POST /api/media/presign` (S3/Wasabi), `GET /api/analytics?...`, `GET /api/billing/export.csv?from&to&sponsor_id&group_id`. Cron: `GET /api/cron/rollup` (Bearer `CRON_SECRET`), also refreshes each connection's fest list and flags revoked ones (festie returns 401).

## 6. Admin panel screens

Sign in / sign up · Dashboard (live today + 7 days) · Ad groups (list; detail: festival, fests, connection status, Connect/Reconnect, ads) · Ad editor (placement, media upload with a preview in the real frame ratio, sponsor, weight, schedule, status; video disabled for poster footer) · Sponsors · Prices (the 5 rows, history) · Analytics (filters group/sponsor/ad/placement/date; chart + table) · Billing (period + sponsor, preview, CSV export) · Account settings.

## 7. Counting and fraud rules (defaults, confirm if wrong)

- Screen footer / fullscreen: heartbeat every 15 s from the player only while tab visible, screen live and not paused; each beat carries elapsed ms (cap 20 s); impression valid after 5 s; video watch = played seconds only.
- Poster generated: one per poster file when the job completes. Poster downloaded: one per document per 24 h.
- Idempotency: `idempotency_key` unique (`jobId:fileIndex:generated`, `session:seq`); engine checks the ad belongs to the connection, fest, placement and was active; screen events only count within an ad's `ttl` after it was served; per-connection rate cap per minute.
- Poster events are emitted only by festie's backend, never by a browser.

## 8. Festie integration (exact files; nothing built yet)

1. **Control**: register app `festie-ads` (callback `/api/festie/callback`, open query). Data only.
2. **App contract**: `packages/shared/src/app-platform.ts` + `apps/api/prisma/schema.prisma` (`App.adsApiUrl`) + hand-written SQL migration (never applied by me) + `app-registry.service.ts`, `dto/app-platform.dto.ts`, control registration form. Adds an `ads` capability; consent text "Show your ads on this festival". Check consent/connection code first; revisit if scopes can't carry it.
3. **Gateway** (new, in api-core/api): `AdsGatewayService`: finds the ads connection for a sub-fest, signs and calls the engine, **3 s timeout, 60 s cache, fail-open**. Endpoints added to `public-website.controller.ts`: `GET /public-website/v1/screens/:slug/ad?placement=` and `POST /public-website/v1/screens/:slug/ad-events` (additive per rule 10; screen must be live; session ad-validation).
4. **Screens** (`apps/public-website/src/default-pages/screens/`): new `ads-client.ts`, `use-ad-slot.ts`, `ad-slot.tsx` (image/video, heartbeat). `screen-player.tsx`: footer renders the ad; **no ad → footer area removed (scene uses 100% height), returns when an ad is available again** (re-serve every 60 s and on `SCREEN_LIVE_UPDATED`). `scenes/ad-placeholder.tsx` → fullscreen ad; a fullscreen scene with no ad is skipped like an unplayable scene (`isPlayable`). Pass `screen.slug` from `screens-live.tsx`. Admin preview (`screens-preview.tsx`, admin editor) keeps the placeholder and sends no events. Docs: update `docs/features/public-portal/website-screens.md`.
5. **Poster footer** (confirmed by spike M1b, see [docs/spike-m1b.md](docs/spike-m1b.md)): in `requestTemplateGeneration` (`packages/api-core/.../template-export.service.ts`, `renderPayload.job`, ~line 495) a POSTER-type job with a connected sub-fest gets one ad and `job.adFooter { adId, imageUrl, width, height }`. Exporter (Go): add `AdFooter` to `Template`, set it in `processPreparedJob` and `renderAndStoreDocument`; in `renderPreparedHTML` (`prepared_renderer.go:231`) the `.export-page` div height becomes `PageHeightPx + footerPx` (footerPx = pageWidth × h/w) and the `<img>` is placed at `top: PageHeightPx`. Screenshots are taken per element (`page_renderer.go`), so JPG and JPG_ZIP work with no capture change. **PDF posters get no footer in the MVP** (`renderPDF` uses a fixed paper height). The exporter HEADs the image first and drops the footer on failure. Public poster flows share this path.
6. **Poster events** (spike M1b): "generated": `template-export-events.service.ts` `publishJobUpdate` on COMPLETED with `adFooter`; per-item jobs count `GENERATED` rows of `generated_template_document` (key `documentId:generated`), other jobs count rendered pages (key `jobId:generated`). "Downloaded": server-mediated paths are trackable as they are: public `getPosterFile` and `getCompletedDownload` (`public-result-poster.service.ts`) and the signed zip tickets (`resolveZipTicket`, `createJobZipTicket`). **Not trackable today:** admin single document download (`programme-documents-panel.tsx:176-182`, `downloadFile(document.fileUrl)`) and admin single-job file download (`background-jobs-panel/template-job-list.tsx`) go straight to storage. Fix in M7: serve them through a signed-ticket API route like the zip (preferred, cannot be inflated by the browser), else an authenticated, idempotent report mutation.
7. **Toggle**: a fest gets the footer if it is in the connection; opt-out = remove the fest from the connection (existing Manage popup, `fest.apps.write`). No new permission keys, no `LookupContext` or panel-table change. Not a `SyncArea`, so nothing to replay (rule 12). API changes need an api-core rebuild and restart (rule 13). Add a CHANGELOG `[Unreleased]` entry (new feature) and a feature doc `docs/features/apps/ads.md` registered in `docs/features/README.md`.

**Spike M1b result:** the risk was real. Admin single-file downloads bypass the API (see item 6), so M7 includes a tracked-download change in festie. Everything else needed for the footer fits the existing exporter without a structural change. Still to check in M7: the watermark/badge (`exportBadgeHTML`) must stay inside the original poster area, not move onto the ad.

## 9. Build order and definition of done

| # | Milestone | Done when |
|---|---|---|
| M0 | Skeleton | Next app on Vercel preview, Neon connected, drizzle migration runs in CI, `/api/health` 200, `.env.example` complete |
| M1 | Auth + shell | Sign up/in/out works, protected layout, account row created |
| M1b | **Spike (festie)** | Written finding: how to append a footer in the exporter, and how admin job downloads are tracked; plan updated if wrong |
| M2 | Sponsors, prices, media, ads | CRUD works; Wasabi upload by presigned URL; **video + poster footer rejected in UI, API and DB**; ad validates media ratio |
| M3 | Connect with Festie | Local engine + local festie: create group → consent → connection and fests listed; revoke shows "Disconnected" |
| M4 | Serve + screens | Real screen shows footer/fullscreen ads from the engine; engine off → footer vanishes, returns when back; admin preview unchanged |
| M5 | Events + rollup | Heartbeats and video watch time stored; duplicates ignored; cron produces correct `ad_daily_stats` (tested on a seeded day) |
| M6 | Analytics + billing | Charts and table match raw events; CSV for a sponsor/period matches hand calculation using rate effective that date |
| M7 | Poster footer | Poster JPG / JPG-zip from festie has the ad below it (watermark stays on the poster); generated counted once per poster file and downloaded once per file per 24 h across public, admin zip, admin single-file and job download paths; PDF posters, no-ad and engine-down posters unchanged |
| M8 | Hardening | Rate limits, signature skew tests, retention job, error pages, runbook; load test of 50 screens beating |

## 10. Verification

Vitest for pricing/rollup/selection/validation and signature checks; contract tests for `serve` and `events`; manual end-to-end per milestone with local festie (`apps/api` + `public-website` + exporter) and the browser pane to watch a live screen, a seeded billing day compared against a hand-computed CSV, and an engine-kill test for fail-open.

## 11. Assumptions to confirm

One group per festival; prices belong to the account (the organizer bills sponsors; no platform fee); currency one per account; rollup and billing days in UTC; a fest-level footer on/off uses the connection list; one ad chosen per poster job, not per poster.
