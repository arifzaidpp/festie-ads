import { cn } from "@/lib/cn";

export interface Bar {
  key: string;
  /** Tooltip text. */
  title: string;
  value: number;
  /** Shown under the bar when it is one of the `labelEvery` ticks. */
  label?: string;
}

/**
 * Plain bars, one per item, scaled to the largest. Flat and token coloured; labels show every `labelEvery`
 * bars so a 30 or 90 day range stays readable on a phone.
 */
export function BarChart({ bars, ariaLabel, labelEvery = 1, className }: { bars: readonly Bar[]; ariaLabel: string; labelEvery?: number; className?: string }) {
  const peak = Math.max(...bars.map((b) => b.value), 0);
  return (
    <div role="img" aria-label={ariaLabel} className={cn("w-full", className)}>
      <div className="flex h-32 items-end gap-px sm:h-40">
        {bars.map((b) => (
          <div key={b.key} title={b.title} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm", b.value > 0 ? "bg-primary/80" : "bg-border/60")}
              style={{ height: peak > 0 && b.value > 0 ? `${Math.max(2, (b.value / peak) * 100)}%` : "2%" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px">
        {bars.map((b, i) => (
          <span key={b.key} className="relative h-4 min-w-0 flex-1">
            {i % labelEvery === 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 text-2xs whitespace-nowrap text-muted-foreground">{b.label}</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
