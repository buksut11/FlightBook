import { getProfile } from "@/lib/auth/get-profile";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await getProfile();
  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-semibold">My profile</h1>
      <p className="mt-1 text-sm capitalize text-muted-foreground">Role: {profile.role}</p>
      <div className="mt-4">
        <ProfileForm profile={profile} />
      </div>
    </div>
  );
}
