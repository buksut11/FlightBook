"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createStaffSchema } from "@/lib/validations/staff";
import type { ActionResult } from "@/lib/types/action";

export async function createStaff(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
  });
  if (error || !created.user) {
    return { ok: false, message: error?.message?.includes("already") ? "That email is already registered." : "Could not create the account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: d.full_name,
    phone: d.phone || null,
    role: d.role,
  });
  if (profileError) {
    // roll back the auth user so we don't orphan it
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, message: "Could not create the staff profile." };
  }

  revalidatePath("/settings/staff");
  return { ok: true };
}

export async function setStaffActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, message: "Could not update the account." };
  revalidatePath("/settings/staff");
  return { ok: true };
}

export async function resetStaffPassword(id: string, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, message: "Could not reset the password." };
  return { ok: true };
}
