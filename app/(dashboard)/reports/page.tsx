import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { DateRange } from "./date-range";
import { StatCard } from "@/components/stat-card";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;

  const supabase = await createClient();
  const { data } = await supabase.rpc("report_summary", { p_from: from, p_to: to });
  const r = (data ?? {}) as {
    total_revenue: number; bookings_count: number; discounts_total: number;
    by_agent: { agent: string; bookings: number; revenue: number }[];
    by_method: { method: string; count: number; total: number }[];
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <Button
          variant="outline"
          render={<a href={`/reports/export?from=${from}&to=${to}`}>Export CSV</a>}
        />
      </div>

      <DateRange from={from} to={to} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" value={formatMoney(r.total_revenue ?? 0, "USD")} />
        <StatCard label="Bookings" value={String(r.bookings_count ?? 0)} />
        <StatCard label="Discounts given" value={formatMoney(r.discounts_total ?? 0, "USD")} />
      </div>

      <Card>
        <CardHeader><CardTitle>By agent</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Revenue collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(r.by_agent ?? []).map((a) => (
                <TableRow key={a.agent}>
                  <TableCell>{a.agent}</TableCell>
                  <TableCell>{a.bookings}</TableCell>
                  <TableCell>{formatMoney(a.revenue, "USD")}</TableCell>
                </TableRow>
              ))}
              {(r.by_agent ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No activity in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>By payment method</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(r.by_method ?? []).map((m) => (
                <TableRow key={m.method}>
                  <TableCell className="capitalize">{m.method.replace("_", " ")}</TableCell>
                  <TableCell>{m.count}</TableCell>
                  <TableCell>{formatMoney(m.total, "USD")}</TableCell>
                </TableRow>
              ))}
              {(r.by_method ?? []).length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No payments in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
