import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/accounts");
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-shell p-4">
      <div className="flex flex-col items-center gap-1">
        <Image src="/logo.svg" alt="Festie" width={140} height={31} priority className="h-8 w-auto" />
        <span className="text-2xs font-semibold tracking-caps text-muted-foreground uppercase">Ads</span>
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 card-shadow-slight sm:p-6">{children}</div>
    </main>
  );
}
