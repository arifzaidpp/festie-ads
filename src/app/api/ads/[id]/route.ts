import { archiveAd, getAd, updateAd } from "@/server/ads";
import { readJson, route } from "@/server/http";
import { adPatchInput } from "@/lib/validation";

type P = { id: string };

export const GET = route<P>(async ({ accountId, params }) => ({ ad: await getAd(await accountId(), params.id) }));

export const PATCH = route<P>(async ({ req, ownerId, accountId, params }) => ({
  ad: await updateAd(ownerId, await accountId(), params.id, await readJson(req, adPatchInput)),
}));

export const DELETE = route<P>(async ({ ownerId, accountId, params }) => ({
  ad: await archiveAd(ownerId, await accountId(), params.id),
}));
