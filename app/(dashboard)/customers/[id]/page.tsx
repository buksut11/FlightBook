import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Customer } from "@/lib/types/database";
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

  const [{ data: customer }, { data: bookings }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase
      .from("bookings")
      .select("*, flights(flight_number, departure_at)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!customer) notFound();
  const c = customer as Customer;

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
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                </TableRow>
              ))}
              {(bookings ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
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
