import { cookies } from "next/headers";
import { accountCookie } from "@/lib/account";
import { createAdAccount, listAdAccounts } from "@/server/accounts";
import { readJson, route } from "@/server/http";
import { adAccountInput } from "@/lib/validation";

export const GET = route(async ({ ownerId }) => ({ accounts: await listAdAccounts(ownerId) }));

/** Creates an account and makes it the active one. */
export const POST = route(async ({ req, ownerId }) => {
  const account = await createAdAccount(ownerId, await readJson(req, adAccountInput));
  (await cookies()).set(accountCookie.name, account.id, accountCookie.options);
  return { account };
});
