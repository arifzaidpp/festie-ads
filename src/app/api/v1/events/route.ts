import { getEnv } from "@/lib/env";
import { SIGNATURE_HEADERS, verifyRequest } from "@/lib/signing";
import { eventsEnvelope, ingestEvents } from "@/server/events";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Festie reports usage here: screen heartbeats and (from M7) poster events. Server to server only;
 * the signature covers the method, path and the raw body. Max 100 events per call.
 * `202 { accepted, duplicates, rejected: [{ id, reason }] }`
 */
export async function POST(req: Request) {
  const secret = getEnv().FESTIE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Festie is not configured." }, 503);

  const body = await req.text();
  const url = new URL(req.url);
  const authentic =
    req.headers.get(SIGNATURE_HEADERS.app) === "festie" &&
    verifyRequest({
      secret,
      timestamp: req.headers.get(SIGNATURE_HEADERS.timestamp),
      signature: req.headers.get(SIGNATURE_HEADERS.signature),
      method: "POST",
      pathWithQuery: `${url.pathname}${url.search}`,
      body,
    });
  if (!authentic) return json({ error: "Invalid signature." }, 401);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Body must be JSON." }, 422);
  }
  const parsed = eventsEnvelope.safeParse(payload);
  if (!parsed.success) return json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, 422);

  const result = await ingestEvents(parsed.data.external_ref, parsed.data.events, new Date(), parsed.data.context);
  if (!result) return json({ error: "No active connection for this reference." }, 404);
  if (result === "rate_limited") {
    return Response.json(
      { error: "Too many events. Slow down." },
      { status: 429, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
    );
  }
  return json(result, 202);
}
