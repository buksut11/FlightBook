import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import { Wizard } from "./wizard";
import { RpcErrorCard } from "@/components/rpc-error-card";
import { FLIGHT_SELECT, type FlightRow } from "@/app/(dashboard)/flights/flight-query";

export default async function NewBookingPage() {
  await getProfile();
  const supabase = await createClient();
  const { data: flights, error } = await supabase
    .from("flights")
    .select(FLIGHT_SELECT)
    .eq("status", "scheduled")
    .gt("departure_at", new Date().toISOString())
    .order("departure_at");

  const bookable = ((flights ?? []) as unknown as FlightRow[]).filter(
    (f) => f.seats_available_economy > 0 || f.seats_available_business > 0
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">New booking</h1>
      {error ? (
        <div className="mt-4">
          <RpcErrorCard error={error} what="the flight list" />
        </div>
      ) : (
        <Wizard flights={bookable} />
      )}
    </div>
  );
}
