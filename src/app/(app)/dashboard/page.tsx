import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { requireAccount } from "@/lib/account";
import { formatHours } from "@/lib/format";
import { listAds } from "@/server/ads";
import { getConnection } from "@/server/connections";
import { getCurrentRates } from "@/server/rates";
import { dailySeries, loadStats, parseFilters } from "@/server/reports";
import { listSponsors } from "@/server/sponsors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { account } = await requireAccount();
  const week = parseFilters({ from: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10) });
  const [sponsors, found, ads, rates, rows] = await Promise.all([
    listSponsors(account.id),
    getConnection(account.ownerId, account.id),
    listAds(account.id),
    getCurrentRates(account.id),
    loadStats(account.id, week),
  ]);
  const daily = dailySeries(rows, week.from, week.to);
  const impressions = daily.reduce((n, d) => n + d.impressions, 0);
  const displayMs = daily.reduce((n, d) => n + d.displayMs, 0);

  const connected = found?.connection.status === "ACTIVE";
  const activeAds = ads.filter((a) => a.status === "ACTIVE").length;
  const steps = [
    { done: connected, label: "Connect with Festie", href: "/settings" },
    { done: sponsors.length > 0, label: "Add a sponsor", href: "/sponsors" },
    { done: rates.some((r) => r.amountMinor !== null), label: "Set your prices", href: "/prices" },
    { done: activeAds > 0, label: "Publish an ad", href: "/ads/new" },
  ];
  const remaining = steps.filter((s) => !s.done);

  return (
    <PageBody>
      <PageHeader title={account.name} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active ads" value={String(activeAds)} />
        <StatCard label="Festie" value={connected ? "Connected" : "Not connected"} hint={connected ? found!.connection.festivalName : undefined} />
        <StatCard label="Impressions" value={String(impressions)} hint="Last 7 days" />
        <StatCard label="Hours shown" value={formatHours(displayMs)} hint="Last 7 days" />
      </div>

      {remaining.length > 0 ? (
        <Panel>
          <SectionHeader title={`Set up (${steps.length - remaining.length}/${steps.length})`} />
          <ul className="divide-y divide-border/30">
            {steps.map((step) => (
              <li key={step.label}>
                <Link href={step.href} className="flex items-center gap-3 py-3 text-sm hover:text-primary">
                  {step.done ? <Check className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                  <span className={step.done ? "text-muted-foreground line-through" : "font-medium"}>{step.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </PageBody>
  );
}
