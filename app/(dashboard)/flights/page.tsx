import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Aircraft, Airport } from "@/lib/types/database";
import { FLIGHT_SELECT, type FlightRow } from "./flight-query";
import { FlightDialog } from "./flight-dialog";
import { LoadBar } from "./load-bar";
import { cancelFlight } from "./actions";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function FlightsPage() {
  const profile = await getProfile();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [{ data: flights }, { data: airports }, { data: fleet }] = await Promise.all([
    supabase.from("flights").select(FLIGHT_SELECT).order("departure_at"),
    supabase.from("airports").select("*").order("code"),
    supabase.from("aircraft").select("*").order("model"),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Flights</h1>
        {isAdmin && (
          <FlightDialog airports={(airports ?? []) as Airport[]} fleet={(fleet ?? []) as Aircraft[]} />
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flight</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Economy</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(flights as unknown as FlightRow[] | null)?.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.flight_number}</TableCell>
                <TableCell>
                  {f.origin?.code} → {f.destination?.code}
                  <span className="block text-xs text-muted-foreground">
                    {f.origin?.city} → {f.destination?.city}
                  </span>
                </TableCell>
                <TableCell>{formatDateTime(f.departure_at)}</TableCell>
                <TableCell>
                  <LoadBar total={f.seats_total_economy} available={f.seats_available_economy} />
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(f.price_economy, f.currency)}
                  </span>
                </TableCell>
                <TableCell>
                  <LoadBar total={f.seats_total_business} available={f.seats_available_business} />
                  {f.price_business !== null && (
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(f.price_business, f.currency)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      f.status === "scheduled"
                        ? "border-green-600 text-green-600"
                        : f.status === "cancelled"
                          ? "border-red-600 text-red-600"
                          : "border-amber-600 text-amber-600"
                    }
                  >
                    {f.status}
                  </Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="space-x-2 text-right">
                    <FlightDialog flight={f} airports={(airports ?? []) as Airport[]} fleet={(fleet ?? []) as Aircraft[]} />
                    {f.status === "scheduled" && (
                      <ConfirmButton
                        action={cancelFlight.bind(null, f.id)}
                        label="Cancel"
                        confirmTitle={`Cancel flight ${f.flight_number}?`}
                        confirmText="Flights with active bookings cannot be cancelled. This cannot be undone."
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
