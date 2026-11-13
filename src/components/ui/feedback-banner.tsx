import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const variants = {
  danger: { box: "bg-destructive/10 text-destructive", Icon: XCircle },
  warning: { box: "bg-warning/10 text-warning", Icon: AlertTriangle },
  success: { box: "bg-success/10 text-success", Icon: CheckCircle2 },
  info: { box: "bg-info/10 text-info", Icon: Info },
} as const;

export function FeedbackBanner({
  variant = "info",
  children,
  className,
}: {
  variant?: keyof typeof variants;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = variants[variant];
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
