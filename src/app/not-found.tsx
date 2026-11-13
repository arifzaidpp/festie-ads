import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-shell p-4 text-center">
      <p className="text-2xs font-semibold tracking-caps text-muted-foreground uppercase">404</p>
      <h1 className="text-lg font-bold tracking-tight">Page not found</h1>
      <p className="text-sm text-muted-foreground">It does not exist or was moved.</p>
      <ButtonLink href="/dashboard" variant="outline">
        Back to dashboard
      </ButtonLink>
    </main>
  );
}
