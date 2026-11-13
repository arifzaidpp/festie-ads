import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/ui/page";
import { requireAccount } from "@/lib/account";
import { getAd } from "@/server/ads";
import { HttpError } from "@/server/http";
import { listSponsors } from "@/server/sponsors";
import { getSourceAsset } from "@/server/media";
import { AdForm } from "../ad-form";

export default async function EditAdPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, account } = await requireAccount();
  const { id } = await params;
  const ad = await getAd(account.id, id).catch((error) => {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  });
  if (!ad) notFound();
  const [sponsors, source] = await Promise.all([listSponsors(account.id), getSourceAsset(user.id, ad.sourceAssetId)]);
  return (
    <PageBody>
      <PageHeader title="Edit ad" back={{ href: "/ads", label: "Back to ads" }} />
      <AdForm
        sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))}
        ad={{
          id: ad.id,
          title: ad.title,
          sponsorId: ad.sponsorId,
          placement: ad.placement,
          mediaType: ad.mediaType,
          weight: ad.weight,
          displaySeconds: ad.displaySeconds,
          status: ad.status,
          startsAt: ad.startsAt?.toISOString() ?? null,
          endsAt: ad.endsAt?.toISOString() ?? null,
          layout: ad.layout,
          category: ad.category,
          targetCountries: ad.targetCountries,
          targetRegions: ad.targetRegions,
          targetCities: ad.targetCities,
          targetRadius: ad.targetRadius,
          targetStrict: ad.targetStrict,
          asset: { id: ad.asset.id, kind: ad.asset.kind, url: ad.asset.url, width: ad.asset.width, height: ad.asset.height, durationMs: ad.asset.durationMs },
          source: source ? { id: source.id, width: source.width, height: source.height } : null,
        }}
      />
    </PageBody>
  );
}
