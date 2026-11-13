import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** `panel`: nothing exists yet (with an action). `compact`: a filter matched nothing. */
export function EmptyState({
  title,
  action,
  variant = "panel",
}: {
  title: string;
  action?: ReactNode;
  variant?: "panel" | "compact";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        variant === "panel" ? "panel-card rounded-2xl px-4 py-10" : "py-6",
      )}
    >
      <p className={cn("font-medium", variant === "panel" ? "text-sm" : "text-xs text-muted-foreground")}>{title}</p>
      {action}
    </div>
  );
}
