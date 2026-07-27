import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { sanitizeSearchTerm, isUuid } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import type { Booking, BookingBalance, Profile } from "@/lib/types/database";
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
  const search = sanitizeSearchTerm(q);
  if (search) {
    // PostgREST can't OR a base column with embedded-table columns in one filter,
    // so resolve matching customers first, then OR on base columns only.
    const { data: matched } = await supabase
      .from("customers")
      .select("id")
      .or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    // isUuid guards the in.(...) list, which is also built by concatenation
    const ids = (matched ?? []).map((c) => c.id).filter(isUuid);
    const orParts = [`reference.ilike.%${search}%`];
    if (ids.length > 0) orParts.push(`customer_id.in.(${ids.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data: bookings } = await query;

  // Pair-aware money position per booking (return legs are billed on the
  // outbound leg; balances carried into a newer booking no longer count here).
  const balances = new Map<string, BookingBalance>();
  if (bookings && bookings.length > 0) {
    const { data: balanceRows } = await supabase
      .from("booking_balances")
      .select("*")
      .in("id", bookings.map((b) => b.id));
    for (const row of (balanceRows ?? []) as BookingBalance[]) {
      balances.set(row.id, row);
    }
  }

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
              <TableHead>Paid</TableHead>
              <TableHead>Remaining</TableHead>
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
                <TableCell className="text-muted-foreground">
                  {(() => {
                    const bal = balances.get(b.id);
                    if (!bal || b.status === "cancelled") return "—";
                    if (bal.is_return_leg) return "via outbound";
                    return formatMoney(bal.amount_paid, b.currency);
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    const bal = balances.get(b.id);
                    if (!bal || b.status === "cancelled") return <span className="text-muted-foreground">—</span>;
                    if (bal.is_return_leg) return <span className="text-muted-foreground">—</span>;
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
                <TableCell className="text-muted-foreground">{b.profiles?.full_name}</TableCell>
              </TableRow>
            ))}
            {(bookings ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
