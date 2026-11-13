import { MicroLabel } from "./panel";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel-card flex flex-col gap-1 rounded-3xl p-4">
      <MicroLabel>{label}</MicroLabel>
      <span className="text-2xl font-bold tracking-tight tabular-nums">{value}</span>
      {hint ? <span className="text-2xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
