"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shown when a page throws. The cause stays in the server logs; only a reference (digest) is shown. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-shell p-4 text-center">
      <h1 className="text-lg font-bold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">Try again. If it keeps happening, tell support{error.digest ? ` (ref ${error.digest})` : ""}.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
