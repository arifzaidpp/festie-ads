# Festie Ads runbook

For whoever runs the engine. Design: [PLAN.md](../PLAN.md). Setup: [README.md](../README.md).

## What runs where

| Part | Where | Notes |
|---|---|---|
| Engine (this app) | Vercel Pro | Next.js; port 3100 locally |
| Database | Neon Postgres | migrations: `pnpm db:migrate` against `DATABASE_URL` **before** a deploy that needs them |
| Media | Wasabi (festie's public bucket, prefix `festie-ads/`) | browser uploads with a presigned `PUT` |
| Nightly job | Vercel Cron, 00:10 UTC, `GET /api/cron/rollup` | needs `CRON_SECRET` |
| Callers | festie (public API, API, exporter) | signed with the app's webhook secret |

Festie holds no ad data. If the engine is down, screens drop the ad area within about a minute and posters are made without a footer; nothing breaks (fail-open).

## Environment

Required in production: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_ENCRYPTION_KEY`, `FESTIE_*` (admin URL, API URL, client id/secret, webhook secret), `S3_*`, `CRON_SECRET`. Optional: `GOOGLE_CLIENT_ID/SECRET`. `GET /api/health` returns 200 `db: up`, or 503.

`APP_ENCRYPTION_KEY` encrypts festie tokens in the database. **Changing it makes every stored connection unreadable** (users must reconnect). Rotate only with a plan.

## Limits and rules (where they live)

- Signed requests: timestamp within 5 minutes, signature over method, path, query and raw body (`src/lib/signing.ts`).
- Events: at most 100 per call, 20 s per heartbeat, 5 000 posters per poster event, 24 h old at most, 1 200 stored events per connection per minute (`429` with `Retry-After`) (`src/server/events.ts`).
- Raw events are deleted after 60 days, only for days that are rolled up (`src/server/retention.ts`). Billing reads `ad_daily_stats`, which is kept.
- Media: images PNG/JPEG/WebP up to 5 MB, video MP4 up to 50 MB and 60 s, shapes per placement (`src/lib/placements.ts`). Video never in the poster footer (UI, API and DB check).

## Common problems

**Screen shows no ad / footer missing**
1. `GET /api/health` on the engine.
2. Ad account: connection `Active`? Open Settings and press Refresh (a 401 from festie marks it Disconnected: reconnect).
3. Fest of the screen is ticked in the connection? A screen of the whole festival uses any active connection.
4. Ad is `ACTIVE`, inside its schedule, placement matches, account `ACTIVE`.
5. Festie side: `ADS_API_URL` and `ADS_APP_CLIENT_ID` set on the API and public API, the app is PUBLISHED in Control, the public API has the same `APP_PLATFORM_ENCRYPTION_KEY` as the API. API logs say `Ads engine answered 401` for a wrong secret and `unavailable` for network problems (calls then pause for 15 s).

**Usage is missing in Analytics or Billing**
- Today is rebuilt from raw events on each view; earlier days come from the nightly job. Check Vercel Cron ran: `rollup_runs` has a `DONE` row for the day.
- Backfill a day (idempotent, safe to repeat): `curl -H "Authorization: Bearer $CRON_SECRET" "$ENGINE/api/cron/rollup?date=YYYY-MM-DD"`.
- Events are accepted only for connected fests, matching placement and known ads; check the `rejected` reasons in festie's API log or call `/api/v1/events` by hand.
- Screens count only visible time; the admin live monitor (`?monitor=1`) is never counted.
- Poster events count only when the exporter confirmed it printed the footer (`adFooterApplied` on the job). An exporter older than this feature prints nothing and is not counted.

**A day's invoice looks wrong**: `GET /billing/export.csv?...&level=day` is the audit trail (one row per day and fest with the price used). Prices apply from the day they were set; a day with no price shows `NO PRICE` and is not billed.

**Rotating the festie webhook secret**: regenerate it in Control > Apps, update `FESTIE_WEBHOOK_SECRET` in the engine, redeploy. Until both match, serve and events return 401 and screens show no ad.

**Cleaning test data**: delete the test ad account's ads, events and stats in this order: `ad_events`, `ad_daily_stats`, `ad_daily_breakdown`, `ads`, then assets, sponsors and the account (`ad_groups`); remove the files under `festie-ads/<user id>/` in the bucket.

## Load test

`scripts/load-test.mjs` simulates screens (serve every 10 s, heartbeat every 15 s):

```bash
node --env-file=.env scripts/load-test.mjs --ref <account id> --ad <ad id> --fest <sub fest id> --screens 50 --seconds 90
```

Result on a laptop against Neon (Singapore), 50 screens, 80 s: serve p50 217 ms, p95 359 ms, p99 782 ms; events p50 284 ms, p95 437 ms, p99 569 ms; no failures. It writes events with ids `load-*`; remove them with `delete from ad_events where idempotency_key like 'load-%'`.

## Not done / watch

- Vercel preview and CI for the engine are untested.
- Wasabi bucket CORS for the browser `PUT` is untested; Google sign-in needs real credentials.
- Poster footer end to end (admin click to counted download) needs an exporter running the new code; the footer rendering itself is tested.
- Serve has no rate limit of its own (it is read-only and signed); add one if festie traffic ever surprises you.
