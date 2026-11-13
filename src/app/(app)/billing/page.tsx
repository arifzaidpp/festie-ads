import { Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { RecordCard, ResponsiveRecords, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { PLACEMENT_LABEL, UNIT_LABEL } from "@/lib/placements";
import { requireAccount } from "@/lib/account";
import { listAds } from "@/server/ads";
import { quantityLabel } from "@/server/billing";
import { buildBilling } from "@/server/billing-report";
import { HttpError } from "@/server/http";
import { parseFilters } from "@/server/reports";
import { listSponsors } from "@/server/sponsors";
import { ReportFiltersForm, filtersQuery } from "../report-filters";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

type Search = Record<string, string | undefined>;

export default async function BillingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { account } = await requireAccount();
  const params = await searchParams;
  let filters;
  try {
    filters = parseFilters(params);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return (
      <PageBody>
        <PageHeader title="Billing" />
        <FeedbackBanner variant="danger">{error.message}</FeedbackBanner>
      </PageBody>
    );
  }
  const [report, sponsors, ads] = await Promise.all([buildBilling(account.id, filters), listSponsors(account.id), listAds(account.id)]);

  const quantity = (l: (typeof report.lines)[number]) =>
    `${quantityLabel(l.unit, l.quantity)} ${l.unit === "PER_DOWNLOAD" ? "downloads" : "h"}`;
  const price = (l: (typeof report.lines)[number]) =>
    l.rateMinor === null || !l.currency ? "No price" : `${formatMoney(l.rateMinor, l.currency)} ${UNIT_LABEL[l.unit]}`;
  const amount = (l: (typeof report.lines)[number]) =>
    l.currency && l.rateMinor !== null ? formatMoney(l.amountMinor, l.currency) : "–";

  const downloads = (
    <div className="flex flex-wrap gap-2">
      <ButtonLink variant="outline" compact icon={<Download />} href={`/api/billing/export.csv?${filtersQuery(filters)}`} prefetch={false}>
        Invoice lines CSV
      </ButtonLink>
      <ButtonLink variant="outline" compact icon={<Download />} href={`/api/billing/export.csv?${filtersQuery(filters, { level: "day" })}`} prefetch={false}>
        Daily detail CSV
      </ButtonLink>
    </div>
  );

  return (
    <PageBody>
      <PageHeader title="Billing" actions={report.lines.length ? downloads : undefined} />
      <ReportFiltersForm
        action="/billing"
        filters={filters}
        sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))}
        ads={ads.map((a) => ({ id: a.id, name: a.title }))}
      />

      {report.unpricedRows > 0 ? (
        <FeedbackBanner variant="warning">
          {report.unpricedRows} day(s) have usage but no price in force. They are not billed. Set prices under Prices.
        </FeedbackBanner>
      ) : null}
      {report.includesToday ? <FeedbackBanner variant="info">This period includes today, which is still counting.</FeedbackBanner> : null}

      {report.lines.length === 0 ? (
        <EmptyState variant="compact" title="Nothing to bill in this period" />
      ) : (
        <>
          <ResponsiveRecords
            table={
              <Panel>
                <Table>
                  <thead>
                    <tr>
                      <Th>Sponsor</Th>
                      <Th>Ad</Th>
                      <Th>Placement</Th>
                      <Th className="text-right">Quantity</Th>
                      <Th className="text-right">Price</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((l) => (
                      <Tr key={`${l.adId}-${l.rateMinor}`}>
                        <Td className="font-semibold">{l.sponsorName}</Td>
                        <Td>{l.adTitle}</Td>
                        <Td>
                          {PLACEMENT_LABEL[l.placement]} <span className="text-muted-foreground">· {l.mediaType.toLowerCase()}</span>
                        </Td>
                        <Td className="text-right">{quantity(l)}</Td>
                        <Td className="text-right">{price(l)}</Td>
                        <Td className="text-right font-semibold">{amount(l)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>
            }
            cards={report.lines.map((l) => (
              <RecordCard
                key={`${l.adId}-${l.rateMinor}`}
                title={l.adTitle}
                subtitle={`${l.sponsorName}`}
                badge={<span className="text-sm font-bold tabular-nums">{amount(l)}</span>}
                rows={[
                  ["Placement", `${PLACEMENT_LABEL[l.placement]} · ${l.mediaType.toLowerCase()}`],
                  ["Quantity", quantity(l)],
                  ["Price", price(l)],
                ]}
              />
            ))}
          />
          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-2xs font-semibold tracking-caps text-muted-foreground uppercase">Total</span>
            <div className="text-right">
              {report.totals.map((t) => (
                <p key={t.currency} className="text-2xl font-bold tracking-tight tabular-nums">
                  {formatMoney(t.amountMinor, t.currency)}
                </p>
              ))}
            </div>
          </Panel>
          <div className="md:hidden">{downloads}</div>
        </>
      )}
    </PageBody>
  );
}
