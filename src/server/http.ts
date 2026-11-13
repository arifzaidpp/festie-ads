import { ZodError, type ZodType } from "zod";
import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, pickAccount } from "@/lib/account";
import { getSession } from "@/lib/session";
import { listAdAccounts } from "./accounts";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Postgres "still referenced" errors: 23001 (RESTRICT) and 23503 (foreign key). */
export function isStillReferenced(error: unknown): boolean {
  const code = pgCode(error);
  return code === "23001" || code === "23503";
}

/** Postgres error code, also when the driver wraps the error. */
export function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON.");
  }
  return schema.parse(raw);
}

/** Wraps a route handler: requires a session, maps errors to JSON responses. */
export function route<P = Record<string, never>>(
  fn: (args: { req: Request; ownerId: string; params: P; accountId: () => Promise<string> }) => Promise<unknown>,
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, "Sign in required.");
      const ownerId = session.user.id;
      // The active ad account, resolved only by handlers that need one.
      const accountId = async () => {
        const account = pickAccount(await listAdAccounts(ownerId), (await cookies()).get(ACCOUNT_COOKIE)?.value);
        if (!account) throw new HttpError(409, "Create an ad account first.");
        return account.id;
      };
      const body = await fn({ req, ownerId, params: await ctx.params, accountId });
      return Response.json(body ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof ZodError) {
        return Response.json({ error: error.issues.map((i) => i.message).join("; ") }, { status: 422 });
      }
      console.error(error);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}
