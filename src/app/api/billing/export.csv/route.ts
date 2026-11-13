import { billingCsv, buildBilling } from "@/server/billing-report";
import { HttpError } from "@/server/http";
import { parseFilters } from "@/server/reports";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, pickAccount } from "@/lib/account";
import { listAdAccounts } from "@/server/accounts";

export const dynamic = "force-dynamic";

/** `?from&to&sponsorId&accountId&adId&placement&level=ad|day`. `ad` (default) is invoice lines, `day` the audit trail. */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Sign in required.");
    const url = new URL(req.url);
    const filters = parseFilters(url.searchParams);
    const level = url.searchParams.get("level") === "day" ? "day" : "ad";
    const account = pickAccount(await listAdAccounts(session.user.id), (await cookies()).get(ACCOUNT_COOKIE)?.value);
    if (!account) throw new HttpError(409, "Create an ad account first.");
    const csv = billingCsv(await buildBilling(account.id, filters), level);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="festie-ads-billing-${filters.from}_${filters.to}${level === "day" ? "-daily" : ""}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
