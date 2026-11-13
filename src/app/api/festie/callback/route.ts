import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accountCookie } from "@/lib/account";
import { getEnv } from "@/lib/env";
import { getSession } from "@/lib/session";
import { completeConnect } from "@/server/connections";
import { HttpError } from "@/server/http";

export const dynamic = "force-dynamic";

function appUrl(path: string, req: Request) {
  return new URL(path, getEnv().BETTER_AUTH_URL ?? req.url);
}

/** Festie sends the browser back here with a one-time code (or an error) and our state. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(appUrl("/sign-in", req));
  const params = new URL(req.url).searchParams;
  const state = params.get("state");
  const back = "/settings";
  const fail = (message: string) => NextResponse.redirect(appUrl(`${back}?error=${encodeURIComponent(message)}`, req));

  const code = params.get("code");
  if (!code) return fail(params.get("error") ? "Festie did not approve the connection." : "Missing connection code.");
  try {
    const connectedAccountId = await completeConnect(session.user.id, code, state);
    // Land on the account that was just connected, even if the user switched account meanwhile.
    (await cookies()).set(accountCookie.name, connectedAccountId, accountCookie.options);
    return NextResponse.redirect(appUrl("/settings?connected=1", req));
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message);
    console.error(error);
    return fail("Could not finish the connection.");
  }
}
