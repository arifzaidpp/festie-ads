"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input } from "@/components/ui/form";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { api } from "@/lib/api-client";

export function AccountForm({ id, name: initial }: { id: string; name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api(`/api/accounts/${id}`, "PATCH", { name });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <Panel>
      <SectionHeader title="Account" />
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Button type="submit" loading={busy} disabled={!name.trim() || name.trim() === initial}>
          Save
        </Button>
      </form>
      {error ? <FeedbackBanner variant="danger" className="mt-3">{error}</FeedbackBanner> : null}
    </Panel>
  );
}
