"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Field, Input } from "@/components/ui/form";
import { authClient } from "@/lib/auth-client";

const OAUTH_ERRORS: Record<string, string> = {
  account_not_linked: "An account with this email already exists. Sign in with your password.",
  unable_to_link_account: "An account with this email already exists. Sign in with your password.",
  access_denied: "Google sign in was cancelled.",
};

export function AuthForm({
  mode,
  googleEnabled = false,
  oauthError,
}: {
  mode: "sign-in" | "sign-up";
  googleEnabled?: boolean;
  oauthError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    oauthError ? (OAUTH_ERRORS[oauthError] ?? "Google sign in failed. Try again.") : null,
  );
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const result = isSignUp
      ? await authClient.signUp.email({ name: String(form.get("name") ?? ""), email, password })
      : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    router.replace("/accounts");
    router.refresh();
  }

  async function google() {
    setError(null);
    setBusy(true);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/accounts",
      errorCallbackURL: `/${mode}`,
    });
    // On success the browser is already leaving for Google.
    if (result.error) {
      setBusy(false);
      setError(result.error.message ?? "Google sign in failed.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-lg font-bold tracking-tight">{isSignUp ? "Create account" : "Sign in"}</h1>
      {isSignUp ? (
        <Field label="Name">
          <Input name="name" required autoComplete="name" placeholder="e.g. Ayesha Khan" />
        </Field>
      ) : null}
      <Field label="Email">
        <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      </Field>
      <Field label="Password" hint={isSignUp ? "8 characters or more" : undefined}>
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder="Password"
        />
      </Field>
      {error ? <FeedbackBanner variant="danger">{error}</FeedbackBanner> : null}
      <Button type="submit" loading={busy} className="w-full">
        {isSignUp ? "Sign up" : "Sign in"}
      </Button>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-2xs text-muted-foreground">
            <span className="h-px flex-1 bg-border/60" />
            or
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <Button variant="outline" onClick={google} disabled={busy} className="w-full">
            Continue with Google
          </Button>
        </>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        {isSignUp ? "Have an account? " : "No account? "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"} className="font-medium text-primary hover:underline">
          {isSignUp ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </form>
  );
}
