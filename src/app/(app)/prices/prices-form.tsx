"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input } from "@/components/ui/form";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { api } from "@/lib/api-client";
import { PLACEMENT_LABEL, UNIT_LABEL, unitFor, type MediaType, type Placement } from "@/lib/placements";

type Rate = {
  placement: Placement;
  mediaType: MediaType;
  amountMinor: number | null;
  currency: string | null;
  effectiveFrom: string | null;
};

export function PricesForm({ rates }: { rates: Rate[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const currency = rates.find((r) => r.currency)?.currency ?? "USD";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await api("/api/rates", "PUT", {
      currency: String(data.get("currency") ?? ""),
      rates: rates.map((r) => ({
        placement: r.placement,
        mediaType: r.mediaType,
        amount: Number(data.get(`${r.placement}:${r.mediaType}`) ?? 0),
      })),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Panel>
        <SectionHeader
          title="Price per placement"
          actions={
            <span title="A change applies from today. Earlier days keep the price they had." className="text-muted-foreground">
              <Info className="size-3.5" aria-label="A change applies from today. Earlier days keep the price they had." />
            </span>
          }
        />
        <Field label="Currency" className="mb-4 max-w-32">
          <Input name="currency" defaultValue={currency} maxLength={3} required className="uppercase" />
        </Field>
        <ul className="divide-y divide-border/30">
          {rates.map((r) => {
            const name = `${r.placement}:${r.mediaType}`;
            return (
              <li key={name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {PLACEMENT_LABEL[r.placement]} <span className="font-normal text-muted-foreground">· {r.mediaType === "IMAGE" ? "Image" : "Video"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{UNIT_LABEL[unitFor(r.placement, r.mediaType)]}</p>
                </div>
                <Input
                  name={name}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  required
                  aria-label={`${PLACEMENT_LABEL[r.placement]} ${r.mediaType === "IMAGE" ? "image" : "video"} price`}
                  placeholder="0.00"
                  defaultValue={r.amountMinor == null ? "" : (r.amountMinor / 100).toFixed(2)}
                  className="w-full text-right tabular-nums sm:w-32"
                />
              </li>
            );
          })}
        </ul>
      </Panel>
      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}
      {saved ? <FeedbackBanner variant="success">Prices saved. They apply from today.</FeedbackBanner> : null}
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        Save prices
      </Button>
    </form>
  );
}
