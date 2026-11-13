import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page title row: title on the left, actions on the right, wrapping on phones. */
export function PageHeader({
  title,
  back,
  actions,
  className,
}: {
  title: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="-ml-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-shell-hover hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
          </Link>
        ) : null}
        <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Wraps page content: consistent vertical rhythm. */
export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("space-y-4 pb-6", className)}>{children}</div>;
}
