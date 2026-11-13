// Stand-in for festie's app platform, for local development and tests.
// Mirrors: GET /apps/connect (consent, auto-approves), POST /apps/oauth/token,
// GET|DELETE /app-api/v1/connection. Test helpers: POST /__revoke, POST /__fests, GET /__state.
//
//   MOCK_REDIRECT=http://localhost:3100/api/festie/callback node scripts/mock-festie.mjs
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 4900);
const CLIENT_ID = process.env.MOCK_CLIENT_ID ?? "mock-client";
const CLIENT_SECRET = process.env.MOCK_CLIENT_SECRET ?? "mock-secret";
const REDIRECT = process.env.MOCK_REDIRECT ?? "http://localhost:3000/api/festie/callback";

const festival = { id: "11111111-1111-4111-8111-111111111111", name: "Mock Fest 2026", subdomain: "mockfest" };
let fests = [
  { id: "22222222-2222-4222-8222-222222222221", name: "Main Stage Fest", slug: "main", timeZone: "Asia/Kolkata" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Campus Fest", slug: "campus", timeZone: "Asia/Kolkata" },
];
const codes = new Map(); // code -> { externalRef, used }
const tokens = new Map(); // token -> { externalRef, revoked }

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");

  if (req.method === "GET" && url.pathname === "/apps/connect") {
    const q = url.searchParams;
    if (q.get("client_id") !== CLIENT_ID || q.get("redirect_uri") !== REDIRECT) {
      return json(res, 400, { error: "invalid client_id or redirect_uri" });
    }
    const code = randomBytes(16).toString("hex");
    codes.set(code, { externalRef: q.get("external_ref") ?? "", used: false });
    const back = new URL(REDIRECT);
    back.searchParams.set("code", code);
    back.searchParams.set("state", q.get("state") ?? "");
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/apps/oauth/token") {
    const b = await readBody(req);
    if (b.client_id !== CLIENT_ID || b.client_secret !== CLIENT_SECRET) return json(res, 401, { error: "invalid_client" });
    const entry = codes.get(b.code);
    if (!entry || entry.used || b.redirect_uri !== REDIRECT) return json(res, 400, { error: "invalid_grant" });
    entry.used = true;
    const token = `fat_${randomBytes(16).toString("hex")}`;
    tokens.set(token, { externalRef: entry.externalRef, revoked: false });
    return json(res, 200, {
      access_token: token,
      token_type: "Bearer",
      scope: "candidates:read teams:read programmes:read schedule:read",
      festival_id: festival.id,
      sub_fest_ids: fests.map((f) => f.id),
      external_ref: entry.externalRef,
    });
  }

  if (url.pathname === "/app-api/v1/connection") {
    const t = tokens.get(auth);
    if (!t || t.revoked) return json(res, 401, { message: "Unauthorized" });
    if (req.method === "DELETE") {
      t.revoked = true;
      return json(res, 200, { revoked: true });
    }
    if (req.method === "GET") {
      return json(res, 200, { festival, app: "festie-ads", scopes: [], subFests: fests });
    }
  }

  if (req.method === "POST" && url.pathname === "/__revoke") {
    for (const t of tokens.values()) t.revoked = true;
    return json(res, 200, { revoked: tokens.size });
  }
  if (req.method === "POST" && url.pathname === "/__fests") {
    fests = (await readBody(req)).fests ?? fests;
    return json(res, 200, { fests });
  }
  if (req.method === "GET" && url.pathname === "/__state") {
    return json(res, 200, { tokens: [...tokens.values()], fests });
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`mock festie on http://localhost:${PORT}`));
