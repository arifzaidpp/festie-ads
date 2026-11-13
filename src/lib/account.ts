import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listAdAccounts } from "@/server/accounts";
import { requireSession } from "./session";

export const ACCOUNT_COOKIE = "fa_account";

export const accountCookie = {
  name: ACCOUNT_COOKIE,
  options: { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 },
};

/** Picks the active account: the one in the cookie when it is still the owner's, else the oldest. Pure, so it is tested. */
export function pickAccount<T extends { id: string }>(accounts: readonly T[], wanted: string | undefined): T | null {
  return accounts.find((a) => a.id === wanted) ?? accounts[0] ?? null;
}

/** Session plus the active ad account. No account yet: sends the user to create one. */
export async function requireAccount() {
  const session = await requireSession();
  const accounts = await listAdAccounts(session.user.id);
  const account = pickAccount(accounts, (await cookies()).get(ACCOUNT_COOKIE)?.value);
  if (!account) redirect("/accounts/new");
  return { user: session.user, accounts, account };
}
