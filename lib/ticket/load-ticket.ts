import { createClient } from "@/lib/supabase/server";
import { FLIGHT_SELECT, type FlightRow } from "@/app/(dashboard)/flights/flight-query";
import type { Booking, CabinClass, Customer, Passenger } from "@/lib/types/database";

export interface TicketLeg {
  flight_number: string;
  origin_code: string;
  origin_city: string;
  destination_code: string;
  destination_city: string;
  departure_at: string;
  arrival_at: string;
  cabin_class: string;
  baggage_kg: number;
}

export interface TicketData {
  reference: string;
  status: Booking["status"];
  currency: string;
  customer: Pick<Customer, "full_name" | "phone" | "email">;
  passengers: Pick<Passenger, "full_name" | "id_number" | "passenger_type">[];
  legs: TicketLeg[];
  total_amount: number;
  paid: number;
  extra_baggage_kg: number;
  discount_value: number;
  discount_type: string;
  agent_name: string;
}

type BookingWithJoins = Booking & {
  customers: Pick<Customer, "full_name" | "phone" | "email"> | null;
  flights: FlightRow | null;
  profiles: { full_name: string } | null;
};

function legFromFlight(f: FlightRow, cabin: CabinClass): TicketLeg {
  return {
    flight_number: f.flight_number,
    origin_code: f.origin?.code ?? "",
    origin_city: f.origin?.city ?? "",
    destination_code: f.destination?.code ?? "",
    destination_city: f.destination?.city ?? "",
    departure_at: f.departure_at,
    arrival_at: f.arrival_at,
    cabin_class: cabin,
    baggage_kg: cabin === "economy" ? f.baggage_kg_economy : f.baggage_kg_business,
  };
}

export async function loadTicketData(bookingId: string): Promise<TicketData | null> {
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `*, customers(full_name, phone, email), flights(${FLIGHT_SELECT}), profiles!bookings_created_by_fkey(full_name)`
    )
    .eq("id", bookingId)
    .single();
  if (!booking) return null;
  const b = booking as unknown as BookingWithJoins;
  if (!b.flights) return null;

  const { data: passengers } = await supabase
    .from("passengers")
    .select("full_name, id_number, passenger_type")
    .eq("booking_id", bookingId);

  const legs: TicketLeg[] = [legFromFlight(b.flights, b.cabin_class)];
  let total = b.total_amount;

  if (b.linked_booking_id) {
    const { data: linked } = await supabase
      .from("bookings")
      .select(`*, flights(${FLIGHT_SELECT})`)
      .eq("id", b.linked_booking_id)
      .single();
    const l = linked as unknown as (Booking & { flights: FlightRow | null }) | null;
    if (l?.flights) {
      legs.push(legFromFlight(l.flights, l.cabin_class));
      total += l.total_amount;
    }
  }

  // paid: sum across this booking and its linked leg (payment lives on outbound)
  const ids = b.linked_booking_id ? [bookingId, b.linked_booking_id] : [bookingId];
  const { data: payments } = await supabase
    .from("payments")
    .select("amount, booking_id")
    .in("booking_id", ids);
  const paid = (payments ?? []).reduce((s, p) => s + p.amount, 0);

  return {
    reference: b.reference,
    status: b.status,
    currency: b.currency,
    customer: b.customers ?? { full_name: "—", phone: "", email: null },
    passengers: passengers ?? [],
    legs,
    total_amount: total,
    paid,
    extra_baggage_kg: b.extra_baggage_kg,
    discount_value: b.discount_value,
    discount_type: b.discount_type,
    agent_name: b.profiles?.full_name ?? "—",
  };
}
