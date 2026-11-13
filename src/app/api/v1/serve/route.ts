import { z } from "zod";
import { getEnv } from "@/lib/env";
import { PLACEMENTS } from "@/lib/placements";
import { SIGNATURE_HEADERS, verifyRequest } from "@/lib/signing";
import { viewerFromParams } from "@/lib/viewer";
import { serveAd } from "@/server/serve";

export const dynamic = "force-dynamic";

const query = z.object({
  external_ref: z.uuid(),
  sub_fest_id: z.string().min(1).max(64).optional(),
  placement: z.enum(PLACEMENTS),
  media_types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",") : undefined)),
  exclude: z.uuid().optional(),
});

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Festie asks for the ad to show. Server to server only: the request is signed with the secret
 * festie holds for this app (see signRequest). Anything but a valid request gets no ad data.
 */
export async function GET(req: Request) {
  const secret = getEnv().FESTIE_WEBHOOK_SECRET;
  if (!secret) return json({ error: "Festie is not configured." }, 503);

  const url = new URL(req.url);
  const authentic =
    req.headers.get(SIGNATURE_HEADERS.app) === "festie" &&
    verifyRequest({
      secret,
      timestamp: req.headers.get(SIGNATURE_HEADERS.timestamp),
      signature: req.headers.get(SIGNATURE_HEADERS.signature),
      method: "GET",
      pathWithQuery: `${url.pathname}${url.search}`,
    });
  if (!authentic) return json({ error: "Invalid signature." }, 401);

  const parsed = query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, 422);
  const q = parsed.data;
  if (q.placement === "POSTER_FOOTER" && q.media_types?.some((t) => t.toUpperCase() !== "IMAGE")) {
    return json({ error: "Video is not allowed in the poster footer." }, 422);
  }

  const ad = await serveAd({
    accountId: q.external_ref,
    subFestId: q.sub_fest_id,
    placement: q.placement,
    exclude: q.exclude,
    viewer: viewerFromParams(url.searchParams),
  });
  return json({ ad });
}
