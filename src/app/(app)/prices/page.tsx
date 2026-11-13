import { PageBody, PageHeader } from "@/components/ui/page";
import { requireAccount } from "@/lib/account";
import { getCurrentRates } from "@/server/rates";
import { PricesForm } from "./prices-form";

export const metadata = { title: "Prices" };

export default async function PricesPage() {
  const { account } = await requireAccount();
  const rates = await getCurrentRates(account.id);
  return (
    <PageBody>
      <PageHeader title="Prices" />
      <PricesForm rates={rates} />
    </PageBody>
  );
}
