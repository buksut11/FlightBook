import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  { href: "/settings/airports", title: "Airports", description: "Codes, names, and cities" },
  { href: "/settings/aircraft", title: "Aircraft", description: "Models and default seat capacity" },
  { href: "/settings/staff", title: "Staff", description: "Create accounts, reset passwords, deactivate" },
];

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
