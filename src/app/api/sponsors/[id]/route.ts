import { deleteSponsor, updateSponsor } from "@/server/sponsors";
import { readJson, route } from "@/server/http";
import { sponsorInput } from "@/lib/validation";

type P = { id: string };

export const PATCH = route<P>(async ({ req, accountId, params }) => ({
  sponsor: await updateSponsor(await accountId(), params.id, await readJson(req, sponsorInput)),
}));

export const DELETE = route<P>(async ({ accountId, params }) => {
  await deleteSponsor(await accountId(), params.id);
});
