import { createPresign } from "@/server/media";
import { readJson, route } from "@/server/http";
import { presignInput } from "@/lib/validation";

export const POST = route(async ({ req, ownerId }) => createPresign(ownerId, await readJson(req, presignInput)));
