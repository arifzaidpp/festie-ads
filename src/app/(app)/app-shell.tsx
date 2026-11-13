"use client";

import {
  BarChart3,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Receipt,
  Settings,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { AccountSwitcher, type AccountOption } from "./account-switcher";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/ads", label: "Ads", icon: Megaphone },
  { href: "/sponsors", label: "Sponsors", icon: Handshake },
  { href: "/prices", label: "Prices", icon: Tag },
];
const REPORTS: NavItem[] = [
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: Receipt },
];
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };
/** The phone tab bar shows five slots; the rest live under "More". */
const TABS: NavItem[] = [MAIN[0]!, MAIN[1]!, MAIN[2]!, REPORTS[0]!];
const MORE: NavItem[] = [MAIN[3]!, REPORTS[1]!, SETTINGS];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ className }: { className?: string }) {
  return <Image src="/logo.svg" alt="Festie" width={112} height={25} priority className={cn("h-6 w-auto", className)} />;
}

function Initial({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  };
}

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:bg-shell-hover hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-4", active && "text-primary")} aria-hidden />
      {item.label}
    </Link>
  );
}

export function AppShell({
  user,
  accounts,
  currentId,
  children,
}: {
  user: { name: string; email: string };
  accounts: AccountOption[];
  currentId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const signOut = useSignOut();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-4 p-3 md:flex">
        <Link href="/dashboard" className="px-3 pt-2 pb-1">
          <Logo />
          <span className="mt-1 block text-2xs font-semibold tracking-caps text-muted-foreground uppercase">Ads</span>
        </Link>
        <AccountSwitcher accounts={accounts} currentId={currentId} />
        <nav aria-label="Main" className="flex flex-col gap-1">
          {MAIN.map((item) => (
            <RailLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <nav aria-label="Reports" className="flex flex-col gap-1">
          <span className="px-3 pb-1 text-2xs font-semibold tracking-caps text-muted-foreground uppercase">Reports</span>
          {REPORTS.map((item) => (
            <RailLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <nav aria-label="Account" className="mt-auto flex flex-col gap-1">
          <RailLink item={SETTINGS} pathname={pathname} />
        </nav>
        <div className="flex items-center gap-2 rounded-xl p-2">
          <Initial name={user.name || user.email} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{user.name || "Account"}</p>
            <p className="truncate text-2xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-shell-hover hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Phone header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-shell px-4 md:hidden">
        <Link href="/dashboard" aria-label="Festie Ads">
          <Logo />
        </Link>
        <AccountSwitcher accounts={accounts} currentId={currentId} className="w-44" />
      </header>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="min-h-svh bg-surface p-3 sm:p-5 md:rounded-tl-inset md:p-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </div>
      </main>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 bg-shell pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-col items-center gap-0.5 py-2 text-2xs font-medium", active ? "text-primary" : "text-muted-foreground")}
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-2xs font-medium", MORE.some((i) => isActive(pathname, i.href)) ? "text-primary" : "text-muted-foreground")}
        >
          <MoreHorizontal className="size-5" aria-hidden />
          More
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-(--overlay-scrim)" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">More</span>
              <button type="button" aria-label="Close" onClick={() => setMoreOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-shell-hover">
                <X className="size-4" />
              </button>
            </div>
            <div className="divide-y divide-border/30">
              {MORE.map((item) => (
                <Link key={item.href} href={item.href} className="flex h-12 items-center gap-3 text-sm font-medium">
                  <item.icon className="size-4 text-muted-foreground" aria-hidden />
                  {item.label}
                </Link>
              ))}
              <button type="button" onClick={signOut} className="flex h-12 w-full items-center gap-3 text-sm font-medium text-destructive">
                <LogOut className="size-4" aria-hidden />
                Sign out ({user.email})
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
