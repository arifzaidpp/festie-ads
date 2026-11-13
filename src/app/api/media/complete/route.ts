import { completeUpload } from "@/server/media";
import { readJson, route } from "@/server/http";
import { completeInput } from "@/lib/validation";

export const POST = route(async ({ req, ownerId }) => ({
  asset: await completeUpload(ownerId, await readJson(req, completeInput)),
}));
