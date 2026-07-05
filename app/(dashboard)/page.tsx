import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/stat-card";
import { LiveRefresh } from "@/components/live-refresh";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TodayFlight {
  flight_number: string; departure_at: string;
  seats_available_economy: number; seats_total_economy: number;
  seats_available_business: number; seats_total_business: number;
  origin: string; destination: string;
}

export default async function DashboardPage() {
  const profile = await getProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("dashboard_summary");
  const summary = (data ?? {}) as {
    today_bookings: number; today_revenue: number; pending_count: number;
    today_flights: TodayFlight[];
  };

  return (
    <div className="grid gap-6">
      <LiveRefresh />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Welcome, {profile.full_name}</h1>
        <Button render={<Link href="/bookings/new">New booking</Link>} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today's bookings" value={String(summary.today_bookings ?? 0)} />
        <StatCard label="Today's revenue" value={formatMoney(summary.today_revenue ?? 0, "USD")} />
        <Link href="/bookings?status=pending">
          <StatCard label="Pending bookings" value={String(summary.pending_count ?? 0)}
            hint="Click to follow up" />
        </Link>
      </div>

      <Card>
        <CardHeader><CardTitle>Today&apos;s flights</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {(summary.today_flights ?? []).length === 0 && (
            <p className="text-muted-foreground">No scheduled flights today.</p>
          )}
          {(summary.today_flights ?? []).map((f) => (
            <div key={f.flight_number} className="flex items-center justify-between border-b pb-2 last:border-0">
              <div>
                <p className="font-medium">{f.flight_number} · {f.origin} → {f.destination}</p>
                <p className="text-muted-foreground">{formatDateTime(f.departure_at)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Eco {f.seats_available_economy}/{f.seats_total_economy}
                {f.seats_total_business > 0 && ` · Biz ${f.seats_available_business}/${f.seats_total_business}`}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
