import { cn } from "@/lib/cn";

export type StatusTone = "success" | "info" | "warning" | "danger" | "muted" | "primary";

const tones: Record<StatusTone, string> = {
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
};

const dots: Record<StatusTone, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-destructive",
  muted: "bg-muted-foreground/60",
  primary: "bg-primary",
};

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  connected: "success",
  done: "success",
  draft: "muted",
  paused: "warning",
  archived: "muted",
  revoked: "danger",
  disconnected: "danger",
  failed: "danger",
  running: "info",
};

export function formatStatus(status: string): string {
  const words = status.trim().toLowerCase().replace(/[_-]+/g, " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : status;
}

/** Tinted status pill with a dot. The tone follows the status word unless given. */
export function StatusBadge({
  status,
  tone,
  size = "md",
  className,
}: {
  status: string;
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const resolved = tone ?? STATUS_TONE[status.trim().toLowerCase().replace(/[_\s]+/g, "")] ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-2xs" : "px-2.5 py-1 text-xs",
        tones[resolved],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dots[resolved])} aria-hidden />
      {formatStatus(status)}
    </span>
  );
}

/** Neutral meta chip. */
export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground", className)}>
      {children}
    </span>
  );
}
