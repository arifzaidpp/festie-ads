import { Plus } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { RecordCard, ResponsiveRecords, Table, Td, Th, Tr } from "@/components/ui/table";
import { PLACEMENT_LABEL } from "@/lib/placements";
import { requireAccount } from "@/lib/account";
import { listAds } from "@/server/ads";

export const metadata = { title: "Ads" };

export default async function AdsPage() {
  const { account } = await requireAccount();
  const ads = await listAds(account.id);
  const newAd = (
    <ButtonLink href="/ads/new" icon={<Plus />}>
      New ad
    </ButtonLink>
  );
  return (
    <PageBody>
      <PageHeader title="Ads" actions={ads.length ? newAd : undefined} />
      {ads.length === 0 ? (
        <EmptyState title="No ads yet" action={newAd} />
      ) : (
        <ResponsiveRecords
          table={
            <Panel>
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Sponsor</Th>
                    <Th>Placement</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <Tr key={ad.id}>
                      <Td className="font-semibold">
                        <Link href={`/ads/${ad.id}`} className="hover:text-primary hover:underline">
                          {ad.title}
                        </Link>
                      </Td>
                      <Td>{ad.sponsorName}</Td>
                      <Td>
                        {PLACEMENT_LABEL[ad.placement]} <span className="text-muted-foreground">· {ad.mediaType === "IMAGE" ? "image" : "video"}</span>
                      </Td>
                      <Td>
                        <StatusBadge status={ad.status} size="sm" />
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          }
          cards={ads.map((ad) => (
            <Link key={ad.id} href={`/ads/${ad.id}`} className="block">
              <RecordCard
                title={ad.title}
                subtitle={ad.sponsorName}
                badge={<StatusBadge status={ad.status} size="sm" />}
                rows={[
                  ["Placement", `${PLACEMENT_LABEL[ad.placement]} · ${ad.mediaType === "IMAGE" ? "image" : "video"}`],
                ]}
              />
            </Link>
          ))}
        />
      )}
    </PageBody>
  );
}
