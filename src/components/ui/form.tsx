import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Borderless, tinted control like festie's `Input` (h-control, rounded-xl, bg-shell-control). */
export const controlClass =
  "h-control w-full min-w-0 rounded-xl border-0 bg-shell-control px-3 text-sm shadow-none outline-none transition-all duration-200 placeholder:text-muted-foreground/50 focus-visible:bg-shell focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 aria-invalid:ring-destructive";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(controlClass, "appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
}

/** Label above a control. `hint` is one short line, not a paragraph. */
export function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-foreground/80">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-2xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
