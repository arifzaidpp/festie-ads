"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { api } from "@/lib/api-client";

type Row = { id: string; name: string; festivalName: string | null; connection: "ACTIVE" | "REVOKED" | null; activeAds: number };

export function AccountList({ accounts }: { accounts: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    setBusy(id);
    setError(null);
    const result = await api(`/api/accounts/${id}`, "PUT");
    if (!result.ok) {
      setBusy(null);
      return setError(result.error);
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold tracking-tight">Ad accounts</h1>
        <ButtonLink href="/accounts/new" compact icon={<Plus />}>
          New account
        </ButtonLink>
      </div>
      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}
      <ul className="divide-y divide-border/30">
        {accounts.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => open(a.id)}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 py-3 text-left hover:text-primary disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.connection === "ACTIVE" ? a.festivalName : "Not connected"} · {a.activeAds} active {a.activeAds === 1 ? "ad" : "ads"}
                </span>
              </span>
              <StatusBadge
                status={a.connection === "ACTIVE" ? "connected" : a.connection === "REVOKED" ? "disconnected" : "not connected"}
                tone={a.connection === "ACTIVE" ? "success" : a.connection === "REVOKED" ? "danger" : "muted"}
                size="sm"
              />
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
