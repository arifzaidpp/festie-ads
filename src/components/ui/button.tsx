import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "ghost-muted"
  | "destructive"
  | "soft-destructive"
  | "dashed"
  | "link";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-all duration-150 ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95",
  outline: "border border-border/80 bg-transparent hover:bg-muted",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "bg-transparent hover:bg-accent",
  "ghost-muted": "bg-transparent text-muted-foreground hover:bg-shell-hover hover:text-foreground",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-105",
  "soft-destructive": "bg-destructive/10 text-destructive hover:bg-destructive/15",
  dashed: "border border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  link: "text-primary underline-offset-4 hover:underline active:scale-100",
};

/** Canonical button size: h-9 px-4 text-sm; `compact` is h-8 px-3 text-xs. */
export function buttonClass(variant: ButtonVariant = "default", compact = false, className?: string): string {
  return cn(
    base,
    variants[variant],
    variant === "link" ? "" : compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  compact?: boolean;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, compact, loading, icon, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, compact, className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  compact?: boolean;
  className?: string;
  icon?: ReactNode;
};

/** A link that looks like a button. */
export function ButtonLink({ variant, compact, className, icon, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, compact, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
