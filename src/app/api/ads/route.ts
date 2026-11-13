import { createAd, listAds } from "@/server/ads";
import { readJson, route } from "@/server/http";
import { adInput } from "@/lib/validation";

export const GET = route(async ({ accountId }) => ({ ads: await listAds(await accountId()) }));

export const POST = route(async ({ req, ownerId, accountId }) => ({
  ad: await createAd(ownerId, { ...(await readJson(req, adInput)), accountId: await accountId() }),
}));
