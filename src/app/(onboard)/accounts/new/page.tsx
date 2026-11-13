import { cookies } from "next/headers";
import { ACCOUNT_COOKIE, pickAccount } from "@/lib/account";
import { requireSession } from "@/lib/session";
import { listAdAccounts } from "@/server/accounts";
import { NewAccountForm } from "./new-account-form";

export const metadata = { title: "New ad account" };

export default async function NewAccountPage() {
  const { user } = await requireSession();
  const accounts = await listAdAccounts(user.id);
  const current = pickAccount(accounts, (await cookies()).get(ACCOUNT_COOKIE)?.value);
  return <NewAccountForm first={accounts.length === 0} hasCurrent={Boolean(current)} />;
}
