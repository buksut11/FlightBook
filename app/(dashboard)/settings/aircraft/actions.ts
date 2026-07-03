"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { aircraftSchema } from "@/lib/validations/inventory";
import type { ActionResult } from "@/lib/types/action";

export async function saveAircraft(
  id: string | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = aircraftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const data = { ...parsed.data, registration: parsed.data.registration || null };
  const supabase = await createClient();
  const q = id
    ? supabase.from("aircraft").update(data).eq("id", id)
    : supabase.from("aircraft").insert(data);
  const { error } = await q;
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "That registration already exists." : "Could not save the aircraft.",
    };
  }
  revalidatePath("/settings/aircraft");
  return { ok: true };
}

export async function deleteAircraft(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("aircraft").delete().eq("id", id);
  if (error) {
    return {
      ok: false,
      message: "This aircraft is used by existing flights and can't be deleted.",
    };
  }
  revalidatePath("/settings/aircraft");
  return { ok: true };
}
