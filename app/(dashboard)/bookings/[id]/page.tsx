import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking, BookingEvent, Customer, Flight, Passenger, Payment,
} from "@/lib/types/database";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PaymentDialog } from "./payment-dialog";
import { CancelDialog } from "./cancel-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type BookingDetail = Booking & { customers: Customer | null; flights: Flight | null };

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getProfile();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: booking }, { data: passengers }, { data: payments }, { data: events }] =
    await Promise.all([
      supabase.from("bookings").select("*, customers(*), flights(*)").eq("id", id).single(),
      supabase.from("passengers").select("*").eq("booking_id", id),
      supabase.from("payments").select("*").eq("booking_id", id).order("received_at"),
      supabase
        .from("booking_events")
        .select("*, profiles(full_name)")
        .eq("booking_id", id)
        .order("created_at"),
    ]);

  if (!booking) notFound();
  const b = booking as BookingDetail;

  const linked = b.linked_booking_id
    ? (
        await supabase
          .from("bookings")
          .select("*, flights(flight_number, departure_at)")
          .eq("id", b.linked_booking_id)
          .single()
      ).data as (Booking & { flights: { flight_number: string; departure_at: string } | null }) | null
    : null;

  const paid = (payments as Payment[] | null)?.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const balance = Math.max(0, b.total_amount - paid);

  const canCancel =
    b.status !== "cancelled" &&
    (profile.role === "admin" || (b.created_by === profile.id && b.status === "pending"));
  const canPay = b.status !== "cancelled" && balance > 0;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl font-semibold">{b.reference}</h1>
          <StatusBadge status={b.status} />
        </div>
        <div className="flex gap-2">
          {canPay && <PaymentDialog bookingId={b.id} balance={balance} />}
          {canCancel && <CancelDialog bookingId={b.id} reference={b.reference} isRoundTrip={b.trip_type === "round_trip"} />}
          {/* Plan 7 adds a "Print ticket" button here. */}
        </div>
      </div>

      {linked && (
        <Card>
          <CardHeader><CardTitle>Linked round-trip leg</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <div>
              <Link href={`/bookings/${linked.id}`} className="font-mono text-primary hover:underline">
                {linked.reference}
              </Link>
              {linked.flights && (
                <span className="ml-2 text-muted-foreground">
                  {linked.flights.flight_number} · {formatDateTime(linked.flights.departure_at)}
                </span>
              )}
            </div>
            <StatusBadge status={linked.status} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Flight</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {b.flights && (
            <p>
              {b.flights.flight_number} · {formatDateTime(b.flights.departure_at)} ·{" "}
              <span className="capitalize">{b.cabin_class}</span> · {b.passenger_count} passenger(s)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>{b.customers?.full_name} · {b.customers?.phone}</p>
          {b.customers?.email && <p className="text-muted-foreground">{b.customers.email}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Passengers</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm">
            {(passengers as Passenger[] | null)?.map((p) => (
              <li key={p.id}>
                {p.full_name}{p.id_number ? ` — ${p.id_number}` : ""}{" "}
                <span className="capitalize text-muted-foreground">({p.passenger_type})</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payments</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>Total: {formatMoney(b.total_amount, b.currency)}</p>
          <p>Paid: {formatMoney(paid, b.currency)}</p>
          <p className="font-medium">Balance: {formatMoney(balance, b.currency)}</p>
          <Separator />
          {(payments as Payment[] | null)?.map((p) => (
            <p key={p.id} className="text-muted-foreground">
              {formatMoney(p.amount, b.currency)} via {p.method.replace("_", " ")}
              {p.transaction_ref ? ` (ref: ${p.transaction_ref})` : ""} — {formatDateTime(p.received_at)}
            </p>
          ))}
          {(payments ?? []).length === 0 && (
            <p className="text-muted-foreground">No payments recorded yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-sm text-muted-foreground">
          {(events as (BookingEvent & { profiles: { full_name: string } | null })[] | null)?.map((e) => (
            <p key={e.id}>
              {formatDateTime(e.created_at)} — {e.event.replace("_", " ")}
              {e.profiles ? ` by ${e.profiles.full_name}` : ""}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
