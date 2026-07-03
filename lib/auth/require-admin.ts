import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/get-profile";
import type { Profile } from "@/lib/types/database";

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (profile.role !== "admin") redirect("/");
  return profile;
}
