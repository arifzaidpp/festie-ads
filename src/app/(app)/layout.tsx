import { requireAccount } from "@/lib/account";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, accounts, account } = await requireAccount();
  return (
    <AppShell
      user={{ name: user.name ?? "", email: user.email }}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      currentId={account.id}
    >
      {children}
    </AppShell>
  );
}
