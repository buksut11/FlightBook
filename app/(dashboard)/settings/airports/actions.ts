"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { airportSchema } from "@/lib/validations/inventory";
import type { ActionResult } from "@/lib/types/action";

export async function saveAirport(
  id: string | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = airportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const q = id
    ? supabase.from("airports").update(parsed.data).eq("id", id)
    : supabase.from("airports").insert(parsed.data);
  const { error } = await q;
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "That airport code already exists." : "Could not save the airport.",
    };
  }
  revalidatePath("/settings/airports");
  return { ok: true };
}

export async function deleteAirport(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("airports").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      message: "This airport is used by existing flights and can't be deleted.",
    };
  }
  revalidatePath("/settings/airports");
  return { ok: true };
}
