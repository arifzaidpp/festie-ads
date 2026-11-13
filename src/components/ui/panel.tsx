import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** One flat panel per block. Divide inside it with `divide-y divide-border/30` or `border-t border-border/40`, never a nested bordered card. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("panel-card rounded-2xl p-3 sm:p-5", className)} {...props} />;
}

/** Section title with optional actions on the right. */
export function SectionHeader({ title, actions, className }: { title: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {actions}
    </div>
  );
}

/** Small uppercase label. */
export function MicroLabel({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("text-2xs font-semibold tracking-caps text-muted-foreground uppercase", className)} {...props} />;
}
