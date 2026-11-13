import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/session";
import { startConnect } from "@/server/connections";
import { HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

function appUrl(path: string, req: Request) {
  return new URL(path, getEnv().BETTER_AUTH_URL ?? req.url);
}

/** Browser navigation: sends the signed-in user to festie's consent page for one ad account. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(appUrl("/sign-in", req));
  const accountId = new URL(req.url).searchParams.get("accountId") ?? "";
  try {
    return NextResponse.redirect(await startConnect(session.user.id, accountId));
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "Could not start the connection.";
    if (!(error instanceof HttpError)) console.error(error);
    return NextResponse.redirect(appUrl(`/settings?error=${encodeURIComponent(message)}`, req));
  }
}
