import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageBody, PageHeader } from "@/components/ui/page";
import { requireAccount } from "@/lib/account";
import { getConnection } from "@/server/connections";
import { AccountForm } from "./account-form";
import { ConnectionPanel } from "./connection-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { account } = await requireAccount();
  const query = await searchParams;
  const found = await getConnection(account.ownerId, account.id);

  return (
    <PageBody>
      <PageHeader title="Settings" />
      {query.connected ? <FeedbackBanner variant="success">Connected to Festie.</FeedbackBanner> : null}
      {query.error ? <FeedbackBanner variant="danger">{query.error}</FeedbackBanner> : null}
      <ConnectionPanel
        accountId={account.id}
        archived={account.status === "ARCHIVED"}
        connection={
          found
            ? {
                status: found.connection.status,
                festivalName: found.connection.festivalName,
                lastCheckedAt: found.connection.lastCheckedAt?.toISOString() ?? null,
                fests: found.fests.map((f) => ({ id: f.subFestId, name: f.name })),
              }
            : null
        }
      />
      <AccountForm id={account.id} name={account.name} />
    </PageBody>
  );
}
