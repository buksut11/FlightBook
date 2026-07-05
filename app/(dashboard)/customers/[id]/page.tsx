import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Booking, BookingBalance, Customer, CustomerBalance } from "@/lib/types/database";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type BookingRow = Booking & {
  flights: { flight_number: string; departure_at: string } | null;
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getProfile();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: customer }, { data: bookings }, { data: summary }, { data: balanceRows }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", id).single(),
      supabase
        .from("bookings")
        .select("*, flights(flight_number, departure_at)")
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("customer_balances").select("*").eq("customer_id", id).maybeSingle(),
      supabase.from("booking_balances").select("*").eq("customer_id", id),
    ]);

  if (!customer) notFound();
  const c = customer as Customer;
  const s = summary as CustomerBalance | null;
  const balances = new Map(
    ((balanceRows ?? []) as BookingBalance[]).map((row) => [row.id, row])
  );
  const currency = s?.currency ?? "USD";

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{c.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Phone: {c.phone}</p>
          {c.email && <p>Email: {c.email}</p>}
          {c.notes && <p>Notes: {c.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Account
            <Link
              href={`/customers/${c.id}/statement`}
              className="text-sm font-normal text-primary hover:underline"
            >
              View full statement →
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p>Total charged: {formatMoney(s?.total_charged ?? 0, currency)}</p>
          <p>Total paid: {formatMoney(s?.total_paid ?? 0, currency)}</p>
          <p className="font-medium">
            Outstanding:{" "}
            <span
              className={
                (s?.outstanding ?? 0) > 0
                  ? "text-amber-600 dark:text-amber-500"
                  : "text-green-600 dark:text-green-500"
              }
            >
              {formatMoney(s?.outstanding ?? 0, currency)}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead>Departure</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bookings as BookingRow[] | null)?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.reference}</TableCell>
                  <TableCell>{b.flights?.flight_number}</TableCell>
                  <TableCell>{b.flights ? formatDateTime(b.flights.departure_at) : "—"}</TableCell>
                  <TableCell className="capitalize">{b.cabin_class}</TableCell>
                  <TableCell>{formatMoney(b.total_amount, b.currency)}</TableCell>
                  <TableCell>
                    {(() => {
                      const bal = balances.get(b.id);
                      if (!bal || b.status === "cancelled" || bal.is_return_leg) {
                        return <span className="text-muted-foreground">—</span>;
                      }
                      if (bal.balance > 0) {
                        return (
                          <span className="font-medium text-amber-600 dark:text-amber-500">
                            {formatMoney(bal.balance, b.currency)}
                          </span>
                        );
                      }
                      if (bal.transferred_out > 0 && bal.amount_paid < bal.amount_due) {
                        return <span className="text-muted-foreground">carried forward</span>;
                      }
                      return <span className="text-green-600 dark:text-green-500">Paid</span>;
                    })()}
                  </TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                </TableRow>
              ))}
              {(bookings ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No bookings yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
