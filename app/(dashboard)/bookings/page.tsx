import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Profile } from "@/lib/types/database";
import { BookingFilters } from "./filters";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type BookingRow = Booking & {
  customers: { full_name: string; phone: string } | null;
  flights: { flight_number: string; departure_at: string } | null;
  profiles: { full_name: string } | null;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; agent?: string }>;
}) {
  const profile = await getProfile();
  const { q, status, agent } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("bookings")
    .select(
      "*, customers(full_name, phone), flights(flight_number, departure_at), profiles!bookings_created_by_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (agent) query = query.eq("created_by", agent);
  if (q) {
    query = query.or(
      `reference.ilike.%${q}%,customers.full_name.ilike.%${q}%,customers.phone.ilike.%${q}%`
    );
  }

  const { data: bookings } = await query;

  const agentsList: Profile[] = [];
  if (profile.role === "admin") {
    const { data } = await supabase.from("profiles").select("*").order("full_name");
    if (data) agentsList.push(...(data as Profile[]));
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <div className="mt-4">
        <BookingFilters agents={agentsList} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Flight</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bookings as BookingRow[] | null)?.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link href={`/bookings/${b.id}`} className="font-mono text-primary hover:underline">
                    {b.reference}
                  </Link>
                </TableCell>
                <TableCell>
                  {b.customers?.full_name}
                  <span className="block text-xs text-muted-foreground">{b.customers?.phone}</span>
                </TableCell>
                <TableCell>{b.flights?.flight_number}</TableCell>
                <TableCell>{b.flights ? formatDateTime(b.flights.departure_at) : "—"}</TableCell>
                <TableCell>{formatMoney(b.total_amount, b.currency)}</TableCell>
                <TableCell><StatusBadge status={b.status} /></TableCell>
                <TableCell className="text-muted-foreground">{b.profiles?.full_name}</TableCell>
              </TableRow>
            ))}
            {(bookings ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No bookings match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
