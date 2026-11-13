import { analyticsReport } from "@/server/analytics";
import { route } from "@/server/http";
import { parseFilters } from "@/server/reports";

export const dynamic = "force-dynamic";

/** `?from&to&sponsorId&adId&placement&subFestId&country&deviceType` (dates `YYYY-MM-DD`, UTC). Default: the last 30 days. */
export const GET = route(async ({ req, accountId }) => {
  const filters = parseFilters(new URL(req.url).searchParams);
  return analyticsReport(await accountId(), filters);
});
