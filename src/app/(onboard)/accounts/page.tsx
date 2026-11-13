import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listAccountsWithConnection } from "@/server/connections";
import { AccountList } from "./account-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ad accounts" };

/** The first page after sign-in: every ad account of the user, to open or add. */
export default async function AccountsPage() {
  const { user } = await requireSession();
  const accounts = await listAccountsWithConnection(user.id);
  if (accounts.length === 0) redirect("/accounts/new");
  return (
    <AccountList
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        festivalName: a.festivalName,
        connection: a.connectionStatus,
        activeAds: a.activeAds,
      }))}
    />
  );
}
