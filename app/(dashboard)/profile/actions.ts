"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/get-profile";
import { updateProfileSchema } from "@/lib/validations/staff";
import type { ActionResult } from "@/lib/types/action";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const me = await getProfile();
  const parsed = updateProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone || null })
    .eq("id", me.id);
  if (error) return { ok: false, message: "Could not update your profile." };
  revalidatePath("/profile");
  return { ok: true };
}

export async function saveAvatarUrl(url: string): Promise<ActionResult> {
  const me = await getProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me.id);
  if (error) return { ok: false, message: "Could not save your photo." };
  revalidatePath("/profile");
  return { ok: true };
}
