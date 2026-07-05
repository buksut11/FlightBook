"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { flightSchema } from "@/lib/validations/inventory";
import type { ActionResult } from "@/lib/types/action";

export async function saveFlight(
  id: string | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = flightSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();

  if (id) {
    // Editing: capacity may change; keep availability consistent by re-deriving
    // it from the number of already-booked seats.
    const { data: existing } = await supabase
      .from("flights")
      .select("seats_total_economy, seats_available_economy, seats_total_business, seats_available_business")
      .eq("id", id)
      .single();
    if (!existing) return { ok: false, message: "Flight not found." };

    const bookedEco = existing.seats_total_economy - existing.seats_available_economy;
    const bookedBus = existing.seats_total_business - existing.seats_available_business;
    if (d.seats_total_economy < bookedEco || d.seats_total_business < bookedBus) {
      return {
        ok: false,
        message: `Cannot reduce capacity below booked seats (economy booked: ${bookedEco}, business booked: ${bookedBus}).`,
      };
    }

    const { error } = await supabase
      .from("flights")
      .update({
        flight_number: d.flight_number,
        origin_airport_id: d.origin_airport_id,
        destination_airport_id: d.destination_airport_id,
        aircraft_id: d.aircraft_id,
        departure_at: new Date(d.departure_at).toISOString(),
        arrival_at: new Date(d.arrival_at).toISOString(),
        price_economy: d.price_economy,
        price_business: d.price_business,
        seats_total_economy: d.seats_total_economy,
        seats_available_economy: d.seats_total_economy - bookedEco,
        seats_total_business: d.seats_total_business,
        seats_available_business: d.seats_total_business - bookedBus,
        baggage_kg_economy: d.baggage_kg_economy,
        baggage_kg_business: d.baggage_kg_business,
        currency: d.currency,
      })
      .eq("id", id);
    if (error) return { ok: false, message: "Could not save the flight." };
  } else {
    const { error } = await supabase.from("flights").insert({
      flight_number: d.flight_number,
      origin_airport_id: d.origin_airport_id,
      destination_airport_id: d.destination_airport_id,
      aircraft_id: d.aircraft_id,
      departure_at: new Date(d.departure_at).toISOString(),
      arrival_at: new Date(d.arrival_at).toISOString(),
      price_economy: d.price_economy,
      price_business: d.price_business,
      seats_total_economy: d.seats_total_economy,
      seats_available_economy: d.seats_total_economy,
      seats_total_business: d.seats_total_business,
      seats_available_business: d.seats_total_business,
      baggage_kg_economy: d.baggage_kg_economy,
      baggage_kg_business: d.baggage_kg_business,
      currency: d.currency,
    });
    if (error) return { ok: false, message: "Could not create the flight." };
  }

  revalidatePath("/flights");
  revalidatePath("/");
  return { ok: true };
}

export async function cancelFlight(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("flight_id", id)
    .neq("status", "cancelled");
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      message: `This flight has ${count} active booking(s). Cancel those bookings first.`,
    };
  }

  const { error } = await supabase.from("flights").update({ status: "cancelled" }).eq("id", id);
  if (error) return { ok: false, message: "Could not cancel the flight." };
  revalidatePath("/flights");
  revalidatePath("/");
  return { ok: true };
}
