import { getProfile } from "@/lib/auth/get-profile";

export default async function DashboardPage() {
  const profile = await getProfile();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {profile.full_name}</h1>
      <p className="mt-1 text-muted-foreground">
        Use the sidebar to get started.
      </p>
    </div>
  );
}
