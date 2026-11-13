"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input } from "@/components/ui/form";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { api } from "@/lib/api-client";

type Sponsor = { id: string; name: string; contactEmail: string | null; notes: string | null };

export function SponsorsManager({ sponsors }: { sponsors: Sponsor[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const result = await api("/api/sponsors", "POST", {
      name: String(data.get("name") ?? ""),
      contactEmail: String(data.get("contactEmail") ?? ""),
      notes: String(data.get("notes") ?? ""),
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    form.reset();
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    setRemoving(id);
    const result = await api(`/api/sponsors/${id}`, "DELETE");
    setRemoving(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <>
      <Panel>
        <SectionHeader title="Add sponsor" />
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" required>
            <Input name="name" required placeholder="e.g. Acme Sweets" />
          </Field>
          <Field label="Contact email">
            <Input name="contactEmail" type="email" placeholder="e.g. billing@acme.com" />
          </Field>
          <Field label="Notes">
            <Input name="notes" placeholder="Optional" />
          </Field>
          <div className="sm:col-span-3">
            <Button type="submit" loading={busy} className="w-full sm:w-auto">
              Add sponsor
            </Button>
          </div>
        </form>
      </Panel>

      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}

      {sponsors.length === 0 ? (
        <EmptyState title="No sponsors yet" />
      ) : (
        <Panel>
          <SectionHeader title={`Sponsors (${sponsors.length})`} />
          <ul className="divide-y divide-border/30">
            {sponsors.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[s.contactEmail, s.notes].filter(Boolean).join(" · ") || "No contact"}</p>
                </div>
                <Button variant="ghost-muted" compact loading={removing === s.id} onClick={() => remove(s.id)} icon={<Trash2 />} aria-label={`Delete ${s.name}`}>
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
