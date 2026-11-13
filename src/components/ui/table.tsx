import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Static table: header on a muted tint (`text-2xs` uppercase), rows separated by spacing and a hairline,
 * numbers tabular. Show it from `md` up; on phones render `RecordCard`s instead (see `ResponsiveRecords`).
 */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-separate border-spacing-0 text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "bg-table-header px-3 py-2 text-2xs font-semibold tracking-caps whitespace-nowrap text-table-header-text uppercase first:rounded-l-lg last:rounded-r-lg",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("border-b border-border/30 px-3 py-2.5 tabular-nums", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-table-row-hover", className)} {...props} />;
}

/** Phone version of a table row: title, optional badge, then label/value pairs. */
export function RecordCard({
  title,
  subtitle,
  badge,
  rows,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  rows?: Array<[string, ReactNode]>;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-card rounded-2xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {badge}
      </div>
      {rows?.length ? (
        <dl className="mt-2 divide-y divide-border/30 border-t border-border/40 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">{actions}</div> : null}
    </div>
  );
}

/** Table from `md` up, stacked cards below. Pass both views; only one is visible. */
export function ResponsiveRecords({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="space-y-2 md:hidden">{cards}</div>
    </>
  );
}
