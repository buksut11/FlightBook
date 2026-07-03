import type { Flight } from "@/lib/types/database";

// Later plans (4, 5, 8) reuse this exact join syntax to display routes.
export type FlightRow = Flight & {
  origin: { code: string; city: string } | null;
  destination: { code: string; city: string } | null;
};

export const FLIGHT_SELECT =
  "*, origin:airports!flights_origin_airport_id_fkey(code,city), destination:airports!flights_destination_airport_id_fkey(code,city)";
