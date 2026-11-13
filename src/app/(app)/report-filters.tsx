import { PLACEMENTS, PLACEMENT_LABEL } from "@/lib/placements";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { DEVICE_LABEL } from "@/server/analytics";
import { utcDay } from "@/server/rollup";
import type { ReportFilters } from "@/server/reports";

interface Option {
  id: string;
  name: string;
}

const DEVICES: Option[] = ["tv", "desktop", "mobile", "tablet", "unknown"].map((id) => ({ id, name: DEVICE_LABEL[id]! }));
const PRESETS = [
  { label: "7 days", days: 6 },
  { label: "30 days", days: 29 },
  { label: "90 days", days: 89 },
];

/**
 * A plain GET form: the filters live in the URL, so a report can be bookmarked and the CSV links reuse them.
 * `fests`, `countries` and `devices` only show on analytics.
 */
export function ReportFiltersForm({
  action,
  filters,
  sponsors,
  ads,
  fests,
  countries,
  devices,
}: {
  action: string;
  filters: ReportFilters;
  sponsors: Option[];
  ads: Option[];
  fests?: Option[];
  countries?: Option[];
  devices?: boolean;
}) {
  const select = (name: string, label: string, value: string | undefined, options: Option[]) => (
    <Field label={label}>
      <Select name={name} defaultValue={value ?? ""}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const today = utcDay(new Date());
  return (
    <Panel>
      <form action={action} method="get" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="From (UTC)">
          <Input type="date" name="from" defaultValue={filters.from} />
        </Field>
        <Field label="To (UTC)">
          <Input type="date" name="to" defaultValue={filters.to} />
        </Field>
        {select("sponsorId", "Sponsor", filters.sponsorId, sponsors)}
        {select("adId", "Ad", filters.adId, ads)}
        {select("placement", "Placement", filters.placement, PLACEMENTS.map((p) => ({ id: p, name: PLACEMENT_LABEL[p] })))}
        {fests ? select("subFestId", "Fest", filters.subFestId, fests) : null}
        {countries ? select("country", "Country", filters.country, countries) : null}
        {devices ? select("deviceType", "Device", filters.deviceType, DEVICES) : null}
        <div className="col-span-2 flex flex-wrap items-end gap-2 lg:col-span-1">
          <Button type="submit" className="flex-1 lg:flex-none">
            Apply
          </Button>
          <ButtonLink href={action} variant="ghost-muted">
            Reset
          </ButtonLink>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
        {PRESETS.map((p) => {
          const query = new URLSearchParams({ from: utcDay(new Date(), p.days), to: today }).toString();
          return (
            <ButtonLink key={p.label} href={`${action}?${query}`} variant="ghost-muted" compact>
              {p.label}
            </ButtonLink>
          );
        })}
      </div>
    </Panel>
  );
}

/** The current filters as a query string (empty values left out). */
export function filtersQuery(filters: ReportFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value) params.set(key, String(value));
  }
  return params.toString();
}
