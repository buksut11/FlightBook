"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/get-profile";
import { paymentSchema } from "@/lib/validations/payment";
import { mapRpcError } from "@/lib/rpc-errors";
import type { ActionResult } from "@/lib/types/action";

export async function recordPaymentAction(
  bookingId: string,
  formData: FormData
): Promise<ActionResult> {
  await getProfile();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_payment", {
    p_booking_id: bookingId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_transaction_ref: parsed.data.transaction_ref || null,
  });
  if (error) return { ok: false, message: mapRpcError(error.message) };

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  return { ok: true };
}

export async function cancelBookingAction(
  bookingId: string,
  scope: "leg" | "pair" = "leg"
): Promise<ActionResult> {
  await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
    p_scope: scope,
  });
  if (error) return { ok: false, message: mapRpcError(error.message) };

  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/bookings");
  revalidatePath("/flights");
  return { ok: true };
}
