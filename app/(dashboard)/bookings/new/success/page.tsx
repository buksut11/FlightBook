import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; return?: string }>;
}) {
  await getProfile();
  const { ref, return: returnRef } = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Booking created</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Outbound</p>
            <p className="font-mono text-3xl font-semibold tracking-wider">{ref}</p>
          </div>
          {returnRef && (
            <div>
              <p className="text-xs text-muted-foreground">Return</p>
              <p className="font-mono text-2xl font-semibold tracking-wider">{returnRef}</p>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Status: pending. Record the payment on the outbound booking to confirm
            {returnRef ? " both legs" : " it"}.
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
