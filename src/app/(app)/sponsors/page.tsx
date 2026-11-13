import { PageBody, PageHeader } from "@/components/ui/page";
import { requireAccount } from "@/lib/account";
import { listSponsors } from "@/server/sponsors";
import { SponsorsManager } from "./sponsors-manager";

export const metadata = { title: "Sponsors" };

export default async function SponsorsPage() {
  const { account } = await requireAccount();
  const sponsors = await listSponsors(account.id);
  return (
    <PageBody>
      <PageHeader title="Sponsors" />
      <SponsorsManager
        sponsors={sponsors.map((s) => ({ id: s.id, name: s.name, contactEmail: s.contactEmail, notes: s.notes }))}
      />
    </PageBody>
  );
}
