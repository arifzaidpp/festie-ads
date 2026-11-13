// Simulates N live screens against a running engine: each one asks for an ad every SERVE_EVERY seconds and
// reports a 15 s heartbeat, like the festie screen player does (signed server-to-server calls).
//
//   node --env-file=.env scripts/load-test.mjs --ref <ad group id> --ad <ad id> --fest <sub fest id> \
//        [--screens 50] [--seconds 90] [--base http://localhost:3100]
//
// It writes real events (ids start with "load-"); delete them afterwards:
//   delete from ad_events where idempotency_key like 'load-%';
import { createHmac } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, all) => (v.startsWith("--") ? [...acc, [v.slice(2), all[i + 1]]] : acc), []),
);
const BASE = args.base ?? "http://localhost:3100";
const SCREENS = Number(args.screens ?? 50);
const SECONDS = Number(args.seconds ?? 90);
const SERVE_EVERY = Number(args["serve-every"] ?? 10);
const BEAT_EVERY = Number(args["beat-every"] ?? 15);
const secret = process.env.FESTIE_WEBHOOK_SECRET;
if (!secret || !args.ref || !args.ad || !args.fest) {
  console.error("Need FESTIE_WEBHOOK_SECRET in the env and --ref, --ad, --fest.");
  process.exit(1);
}

const latencies = { serve: [], events: [] };
const failures = { serve: 0, events: 0, byStatus: {} };

function sign(method, pathWithQuery, body = "") {
  const ts = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${ts}.${method}.${pathWithQuery}.${body}`).digest("base64");
  return { "x-ads-app": "festie", "x-ads-timestamp": ts, "x-ads-signature": signature };
}

async function timed(kind, run) {
  const started = performance.now();
  try {
    const response = await run();
    latencies[kind].push(performance.now() - started);
    if (!response.ok) {
      failures[kind]++;
      failures.byStatus[response.status] = (failures.byStatus[response.status] ?? 0) + 1;
    }
    await response.arrayBuffer();
  } catch {
    failures[kind]++;
    failures.byStatus.network = (failures.byStatus.network ?? 0) + 1;
  }
}

const serve = () => {
  const path = `/api/v1/serve?external_ref=${args.ref}&sub_fest_id=${args.fest}&placement=SCREEN_FOOTER`;
  return timed("serve", () => fetch(BASE + path, { headers: sign("GET", path) }));
};

const beat = (screen, seq) => {
  const path = "/api/v1/events";
  const body = JSON.stringify({
    external_ref: args.ref,
    events: [
      {
        id: `load-${runId}-${screen}:${seq}`,
        ad_id: args.ad,
        kind: "SCREEN_DISPLAY_MS",
        placement: "SCREEN_FOOTER",
        sub_fest_id: args.fest,
        value: BEAT_EVERY * 1000,
        session_id: `load${runId}s${screen}`,
        occurred_at: new Date().toISOString(),
      },
    ],
  });
  return timed("events", () =>
    fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...sign("POST", path, body) }, body }),
  );
};

const runId = Date.now().toString(36);
const endAt = Date.now() + SECONDS * 1000;

async function screen(n) {
  await new Promise((r) => setTimeout(r, Math.random() * SERVE_EVERY * 1000)); // screens do not start in lockstep
  let seq = 0;
  let nextBeat = Date.now() + BEAT_EVERY * 1000;
  while (Date.now() < endAt) {
    await serve();
    const wait = Math.min(SERVE_EVERY * 1000, Math.max(0, endAt - Date.now()));
    const until = Date.now() + wait;
    while (Date.now() < until) {
      if (Date.now() >= nextBeat) {
        await beat(n, seq++);
        nextBeat += BEAT_EVERY * 1000;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

const pct = (list, p) => {
  if (list.length === 0) return "-";
  const sorted = [...list].sort((a, b) => a - b);
  return `${sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(0)} ms`;
};

console.log(`${SCREENS} screens for ${SECONDS} s against ${BASE} (serve every ${SERVE_EVERY} s, beat every ${BEAT_EVERY} s)`);
await Promise.all(Array.from({ length: SCREENS }, (_, i) => screen(i)));
for (const kind of ["serve", "events"]) {
  const l = latencies[kind];
  console.log(`${kind.padEnd(6)} n=${l.length} p50=${pct(l, 50)} p95=${pct(l, 95)} p99=${pct(l, 99)} max=${pct(l, 100)} failed=${failures[kind]}`);
}
if (Object.keys(failures.byStatus).length) console.log("failures by status:", failures.byStatus);
process.exit(failures.serve + failures.events > 0 ? 1 : 0);
