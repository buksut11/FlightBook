import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await getProfile();
  const { ref } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Booking created</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="font-mono text-3xl font-semibold tracking-wider">{ref}</p>
          <p className="text-sm text-muted-foreground">
            Status: pending. Record the payment from the booking page to confirm it.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href="/bookings/new">New booking</Link>} />
            <Button variant="outline" render={<Link href="/">Dashboard</Link>} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
