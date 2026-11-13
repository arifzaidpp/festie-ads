"use client";

import { Link2, RefreshCw, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { MicroLabel, Panel, SectionHeader } from "@/components/ui/panel";
import { Chip, StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";

type Connection = {
  status: "ACTIVE" | "REVOKED";
  festivalName: string;
  lastCheckedAt: string | null;
  fests: { id: string; name: string }[];
};

export function ConnectionPanel({
  accountId,
  archived,
  connection,
}: {
  accountId: string;
  archived: boolean;
  connection: Connection | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"POST" | "DELETE" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setBusy(method);
    setError(null);
    const result = await api(`/api/accounts/${accountId}/connection`, method);
    setBusy(null);
    setConfirming(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const connectHref = `/api/festie/connect?accountId=${accountId}`;
  const active = connection?.status === "ACTIVE";

  return (
    <Panel>
      <SectionHeader
        title="Festie connection"
        actions={connection ? <StatusBadge status={active ? "connected" : "disconnected"} tone={active ? "success" : "danger"} /> : <StatusBadge status="not connected" tone="muted" />}
      />

      {!connection ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Pick a festival and its fests. This account's ads show only there.</p>
          {archived ? null : (
            // A full page redirect to festie's consent screen, so a plain anchor.
            <a href={connectHref} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:brightness-105 sm:w-auto">
              <Link2 className="size-4" aria-hidden />
              Connect with Festie
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <MicroLabel>Festival</MicroLabel>
            <p className="text-sm font-semibold">{connection.festivalName}</p>
          </div>

          {active ? (
            <>
              <div className="border-t border-border/40 pt-3">
                <MicroLabel>Fests</MicroLabel>
                {connection.fests.length === 0 ? (
                  <div className="mt-2">
                    <FeedbackBanner variant="warning">No fests connected. Add them in festie (Apps), then refresh.</FeedbackBanner>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {connection.fests.map((f) => (
                      <Chip key={f.id}>{f.name}</Chip>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-2xs text-muted-foreground">
                  Change fests in festie (Apps).
                  {connection.lastCheckedAt ? ` Checked ${new Date(connection.lastCheckedAt).toLocaleString()}.` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
                <Button variant="outline" compact loading={busy === "POST"} disabled={busy !== null} onClick={() => call("POST")} icon={<RefreshCw />}>
                  Refresh
                </Button>
                {confirming ? (
                  <>
                    <Button variant="destructive" compact loading={busy === "DELETE"} onClick={() => call("DELETE")}>
                      Disconnect now
                    </Button>
                    <Button variant="ghost-muted" compact onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="soft-destructive" compact disabled={busy !== null} onClick={() => setConfirming(true)} icon={<Unlink />}>
                    Disconnect
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <FeedbackBanner variant="danger">Festie no longer allows this account. Ads stop showing until you reconnect.</FeedbackBanner>
              {archived ? null : (
                <a href={connectHref} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:brightness-105 sm:w-auto">
                  <Link2 className="size-4" aria-hidden />
                  Reconnect with Festie
                </a>
              )}
            </>
          )}
        </div>
      )}
      {error ? <FeedbackBanner variant="danger" className="mt-3">{error}</FeedbackBanner> : null}
    </Panel>
  );
}
