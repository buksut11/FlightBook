"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/get-profile";
import { newBookingSchema, type NewBookingInput } from "@/lib/validations/booking";
import { mapRpcError } from "@/lib/rpc-errors";
import type { CreateBookingResult } from "@/lib/types/database";

export type CreateBookingActionResult =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export async function createBookingAction(
  input: NewBookingInput
): Promise<CreateBookingActionResult> {
  await getProfile(); // must be active staff; the RPC re-checks
  const parsed = newBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_flight_id: d.flight_id,
    p_cabin_class: d.cabin_class,
    p_passengers: d.passengers.map((p) => ({
      full_name: p.full_name,
      id_number: p.id_number || null,
      passenger_type: p.passenger_type,
    })),
    p_customer_id: d.customer.id ?? null,
    p_customer_name: d.customer.full_name,
    p_customer_phone: d.customer.phone,
    p_customer_email: d.customer.email || null,
  });

  if (error) return { ok: false, message: mapRpcError(error.message) };

  const result = data as CreateBookingResult;
  revalidatePath("/flights");
  revalidatePath("/bookings");
  return { ok: true, reference: result.reference };
}

export async function checkDuplicatePending(
  phone: string,
  flightId: string
): Promise<{ reference: string } | null> {
  await getProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("bookings")
    .select("reference, customers!inner(phone)")
    .eq("flight_id", flightId)
    .eq("status", "pending")
    .eq("customers.phone", phone)
    .limit(1);
  if (data && data.length > 0) return { reference: data[0].reference };
  return null;
}
