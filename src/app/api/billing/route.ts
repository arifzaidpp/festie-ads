import { buildBilling } from "@/server/billing-report";
import { route } from "@/server/http";
import { parseFilters } from "@/server/reports";

export const dynamic = "force-dynamic";

/** Same filters as analytics. Returns the invoice lines, totals per currency and the audit rows. */
export const GET = route(async ({ req, accountId }) => {
  const filters = parseFilters(new URL(req.url).searchParams);
  const { priced: _priced, ...report } = await buildBilling(await accountId(), filters);
  return report;
});
