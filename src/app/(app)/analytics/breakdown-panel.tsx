import { Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { formatHours } from "@/lib/format";
import { mapsUrl, type ExportDimension, type Group } from "@/server/analytics";

const TOP = 12;

function summary(g: Group): string {
  const parts: string[] = [];
  if (g.impressions) parts.push(`${g.impressions} impr.`);
  if (g.displayMs) parts.push(`${formatHours(g.displayMs)} h shown`);
  if (g.watchMs) parts.push(`${formatHours(g.watchMs)} h watched`);
  if (g.posterGenerated) parts.push(`${g.posterGenerated} generated`);
  if (g.posterDownloads) parts.push(`${g.posterDownloads} downloads`);
  return parts.join(" · ") || "No usage";
}

/** A ranked list with a usage bar per row: one layout for every width, no table to scroll. */
export function BreakdownPanel({
  title,
  groups,
  dim,
  query,
  placeLinks,
  className,
}: {
  title: string;
  groups: readonly Group[];
  dim: ExportDimension;
  /** Current filters as a query string, reused by the CSV link. */
  query: string;
  /** Show an "open map" link for rows that are exact places. */
  placeLinks?: boolean;
  className?: string;
}) {
  const shown = groups.slice(0, TOP);
  const usage = (g: Group) => g.displayMs + g.watchMs;
  const peak = Math.max(...groups.map(usage), 0);
  const peakDownloads = Math.max(...groups.map((g) => g.posterDownloads), 0);
  const share = (g: Group) => (peak > 0 ? usage(g) / peak : peakDownloads > 0 ? g.posterDownloads / peakDownloads : 0);

  return (
    <Panel className={className}>
      <SectionHeader
        title={title}
        actions={
          groups.length ? (
            <ButtonLink href={`/api/analytics/export.csv?${query ? `${query}&` : ""}dim=${dim}`} variant="ghost-muted" compact icon={<Download />} prefetch={false}>
              CSV
            </ButtonLink>
          ) : undefined
        }
      />
      {shown.length === 0 ? (
        <EmptyState variant="compact" title="No data" />
      ) : (
        <ul className="divide-y divide-border/30">
          {shown.map((g) => (
            <li key={g.key || g.label} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{g.label}</p>
                  {g.sub ? <p className="truncate text-2xs text-muted-foreground">{g.sub}</p> : null}
                </div>
                {placeLinks && g.key.includes(",") ? (
                  <a
                    href={mapsUrl(Number(g.key.split(",")[0]), Number(g.key.split(",")[1]))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-2xs font-medium text-primary hover:underline"
                  >
                    Map
                  </a>
                ) : null}
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border/40">
                <div className="h-full rounded-full bg-primary/80" style={{ width: `${Math.max(share(g) * 100, share(g) > 0 ? 2 : 0)}%` }} />
              </div>
              <p className="mt-1 text-2xs text-muted-foreground tabular-nums">
                {summary(g)}
                {g.screens > 1 ? ` · ${g.screens} screens` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {groups.length > TOP ? <p className="mt-2 text-2xs text-muted-foreground">Top {TOP} of {groups.length}. The CSV has all.</p> : null}
    </Panel>
  );
}
