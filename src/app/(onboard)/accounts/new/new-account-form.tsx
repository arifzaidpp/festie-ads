"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input } from "@/components/ui/form";
import { api } from "@/lib/api-client";

export function NewAccountForm({ first, hasCurrent }: { first: boolean; hasCurrent: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api("/api/accounts", "POST", { name });
    if (!result.ok) {
      setBusy(false);
      return setError(result.error);
    }
    // Next: connect the account with Festie, from its settings.
    router.push("/settings");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-bold tracking-tight">{first ? "Create your ad account" : "New ad account"}</h1>
        <p className="text-xs text-muted-foreground">One per festival. You connect it with Festie next.</p>
      </div>
      <Field label="Account name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus placeholder="e.g. Kerala Kalolsavam 2026" />
      </Field>
      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {hasCurrent ? (
          <ButtonLink href="/dashboard" variant="outline">
            Cancel
          </ButtonLink>
        ) : null}
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          Create account
        </Button>
      </div>
    </form>
  );
}
