import { createSponsor, listSponsors } from "@/server/sponsors";
import { readJson, route } from "@/server/http";
import { sponsorInput } from "@/lib/validation";

export const GET = route(async ({ accountId }) => ({ sponsors: await listSponsors(await accountId()) }));

export const POST = route(async ({ req, ownerId, accountId }) => ({
  sponsor: await createSponsor(ownerId, await accountId(), await readJson(req, sponsorInput)),
}));
