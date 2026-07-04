"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, saveAvatarUrl } from "./actions";
import type { Profile } from "@/lib/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 2 * 1024 * 1024;

export function ProfileForm({ profile }: { profile: Profile }) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);

  const initials = profile.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const r = await updateProfile(formData);
      if (r.ok) toast.success("Profile updated");
      else toast.error(r.message ?? "Something went wrong.");
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image."); return; }
    if (file.size > MAX_BYTES) { toast.error("Image must be under 2 MB."); return; }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${profile.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`; // cache-bust
      const saved = await saveAvatarUrl(url);
      if (!saved.ok) throw new Error(saved.message);
      setAvatarUrl(url);
      toast.success("Photo updated");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid max-w-md gap-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <Label htmlFor="avatar" className="cursor-pointer text-sm text-primary hover:underline">
            {uploading ? "Uploading…" : "Change photo"}
          </Label>
          <input id="avatar" type="file" accept="image/*" className="hidden" onChange={onFile} disabled={uploading} />
          <p className="text-xs text-muted-foreground">JPG or PNG, under 2 MB.</p>
        </div>
      </div>

      <form action={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" defaultValue={profile.full_name} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={profile.phone ?? ""} />
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </form>
    </div>
  );
}
