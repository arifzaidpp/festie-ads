import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, pickAccount } from "@/lib/account";
import { getSession } from "@/lib/session";
import { listAdAccounts } from "@/server/accounts";
import { EXPORT_DIMENSIONS, analyticsCsv, analyticsReport, type ExportDimension } from "@/server/analytics";
import { HttpError } from "@/server/http";
import { parseFilters } from "@/server/reports";

export const dynamic = "force-dynamic";

/** Same filters as the page plus `dim` (one of the breakdowns, default `day`). */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Sign in required.");
    const url = new URL(req.url);
    const filters = parseFilters(url.searchParams);
    const wanted = url.searchParams.get("dim") ?? "day";
    if (!(EXPORT_DIMENSIONS as readonly string[]).includes(wanted)) throw new HttpError(422, "Unknown breakdown.");
    const account = pickAccount(await listAdAccounts(session.user.id), (await cookies()).get(ACCOUNT_COOKIE)?.value);
    if (!account) throw new HttpError(409, "Create an ad account first.");
    const csv = analyticsCsv(await analyticsReport(account.id, filters), wanted as ExportDimension);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="festie-ads-${wanted}-${filters.from}_${filters.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
