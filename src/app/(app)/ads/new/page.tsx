import { PageBody, PageHeader } from "@/components/ui/page";
import { requireAccount } from "@/lib/account";
import { listSponsors } from "@/server/sponsors";
import { AdForm } from "../ad-form";

export const metadata = { title: "New ad" };

export default async function NewAdPage() {
  const { account } = await requireAccount();
  const sponsors = await listSponsors(account.id);
  return (
    <PageBody>
      <PageHeader title="New ad" back={{ href: "/ads", label: "Back to ads" }} />
      <AdForm sponsors={sponsors.map((s) => ({ id: s.id, name: s.name }))} />
    </PageBody>
  );
}
