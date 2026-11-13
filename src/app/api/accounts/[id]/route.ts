import { cookies } from "next/headers";
import { accountCookie } from "@/lib/account";
import { getOwnedAccount, updateAdAccount } from "@/server/accounts";
import { readJson, route } from "@/server/http";
import { adAccountInput } from "@/lib/validation";

type P = { id: string };

export const PATCH = route<P>(async ({ req, ownerId, params }) => ({
  account: await updateAdAccount(ownerId, params.id, await readJson(req, adAccountInput)),
}));

/** Switches the active account (the sidebar picker). */
export const PUT = route<P>(async ({ ownerId, params }) => {
  const account = await getOwnedAccount(ownerId, params.id);
  (await cookies()).set(accountCookie.name, account.id, accountCookie.options);
  return { account };
});
