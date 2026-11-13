import { Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { BarChart } from "@/components/ui/bar-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { requireAccount } from "@/lib/account";
import { formatHours } from "@/lib/format";
import { analyticsReport } from "@/server/analytics";
import { listAds } from "@/server/ads";
import { HttpError } from "@/server/http";
import { parseFilters } from "@/server/reports";
import { listSponsors } from "@/server/sponsors";
import { ReportFiltersForm, filtersQuery } from "../report-filters";
import { BreakdownPanel } from "./breakdown-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

type Search = Record<string, string | undefined>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { account } = await requireAccount();
  const params = await searchParams;
  let filters;
  try {
    filters = parseFilters(params);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return (
      <PageBody>
        <PageHeader title="Analytics" />
        <FeedbackBanner variant="danger">{error.message}</FeedbackBanner>
      </PageBody>
    );
  }
  const [report, sponsors, ads] = await Promise.all([analyticsReport(account.id, filters), listSponsors(account.id), listAds(account.id)]);
  const query = filtersQuery(filters);
  const t = report.totals;
  const empty = t.impressions + t.displayMs + t.watchMs + t.posterGenerated + t.posterDownloads === 0;
  const dayStep = Math.max(1, Math.ceil(report.daily.length / 8));

  return (
    <PageBody>
      <PageHeader
        title="Analytics"
        actions={
          <ButtonLink href={`/api/analytics/export.csv?${query}&dim=day`} variant="outline" compact icon={<Download />} prefetch={false}>
            Daily CSV
          </ButtonLink>
        }
      />
      <ReportFiltersForm
        action="/analytics"
        filters={filters}
        sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))}
        ads={ads.map((a) => ({ id: a.id, name: a.title }))}
        fests={report.options.fests}
        countries={report.options.countries.map((c) => ({ id: c.code, name: c.name }))}
        devices
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Impressions" value={String(t.impressions)} />
        <StatCard label="Hours shown" value={formatHours(t.displayMs)} />
        <StatCard label="Hours watched" value={formatHours(t.watchMs)} />
        <StatCard label="Screens" value={String(t.screens)} />
        <StatCard label="Countries" value={String(t.countries)} />
        <StatCard label="Places" value={String(t.places)} />
        <StatCard label="Posters generated" value={String(t.posterGenerated)} />
        <StatCard label="Poster downloads" value={String(t.posterDownloads)} />
      </div>

      {empty ? (
        <EmptyState title="No usage in this period" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <SectionHeader title="Hours shown per day" />
              <BarChart
                ariaLabel="Hours shown per day"
                labelEvery={dayStep}
                bars={report.daily.map((d) => ({
                  key: d.date,
                  value: d.displayMs,
                  label: d.date.slice(5),
                  title: `${d.date}: ${formatHours(d.displayMs)} h, ${d.impressions} impressions, ${d.posterDownloads} downloads`,
                }))}
              />
              <p className="mt-2 text-2xs text-muted-foreground">
                {filters.from} to {filters.to} (UTC).{report.includesToday ? " Today is still counting." : ""}
              </p>
            </Panel>
            <Panel>
              <SectionHeader title="Hours shown by time of day" />
              <BarChart
                ariaLabel="Hours shown by hour of day"
                labelEvery={3}
                bars={report.hourly.map((h) => ({
                  key: String(h.hour),
                  value: h.displayMs,
                  label: String(h.hour).padStart(2, "0"),
                  title: `${String(h.hour).padStart(2, "0")}:00 UTC: ${formatHours(h.displayMs)} h, ${h.impressions} impressions`,
                }))}
              />
              <p className="mt-2 text-2xs text-muted-foreground">Hour of day, UTC.</p>
            </Panel>
          </div>

          <SectionHeader title="Where" className="mb-0" />
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownPanel title="Country" groups={report.byCountry} dim="country" query={query} />
            <BreakdownPanel title="State / region" groups={report.byRegion} dim="region" query={query} />
            <BreakdownPanel title="City" groups={report.byCity} dim="city" query={query} />
            <BreakdownPanel title="Exact places" groups={report.byPlace} dim="place" query={query} placeLinks />
          </div>
          <p className="-mt-2 text-2xs text-muted-foreground">Place comes from the network location of the screen: city level, rounded to about 1 km. Posters have none.</p>

          <SectionHeader title="Which screen and fest" className="mb-0" />
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownPanel title="Screen" groups={report.byScreen} dim="screen" query={query} />
            <BreakdownPanel title="Fest" groups={report.byFest} dim="fest" query={query} />
          </div>

          <SectionHeader title="Devices" className="mb-0" />
          <div className="grid gap-4 lg:grid-cols-3">
            <BreakdownPanel title="Device" groups={report.byDevice} dim="device" query={query} />
            <BreakdownPanel title="System" groups={report.byOs} dim="os" query={query} />
            <BreakdownPanel title="Browser" groups={report.byBrowser} dim="browser" query={query} />
          </div>

          <SectionHeader title="Ads" className="mb-0" />
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownPanel title="By ad" groups={report.byAd} dim="ad" query={query} />
            <BreakdownPanel title="By placement" groups={report.byPlacement} dim="placement" query={query} />
          </div>
        </>
      )}
    </PageBody>
  );
}
