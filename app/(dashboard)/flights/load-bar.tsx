import { cn } from "@/lib/utils";

export function LoadBar({ total, available }: { total: number; available: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const booked = total - available;
  const pct = Math.round((booked / total) * 100);
  return (
    <div className="min-w-28">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 90 ? "bg-red-600" : pct >= 70 ? "bg-amber-600" : "bg-green-600"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {booked}/{total} booked
      </p>
    </div>
  );
}
