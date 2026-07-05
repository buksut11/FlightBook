import type { CabinClass, Flight, PassengerType } from "@/lib/types/database";

// Fare fields only — the wizard's FlightRow and plain Flight both satisfy this.
export type FareFields = Pick<
  Flight,
  | "price_economy"
  | "price_business"
  | "price_economy_child"
  | "price_economy_infant"
  | "price_business_child"
  | "price_business_infant"
>;

/**
 * Fare for one passenger of the given type. Child/infant fares fall back to
 * the adult fare when the flight doesn't define them (mirrors leg_subtotal
 * in the create_booking RPC).
 */
export function fareFor(flight: FareFields, cabin: CabinClass, type: PassengerType): number {
  const adult = cabin === "economy" ? flight.price_economy : flight.price_business ?? 0;
  if (type === "child") {
    return (cabin === "economy" ? flight.price_economy_child : flight.price_business_child) ?? adult;
  }
  if (type === "infant") {
    return (cabin === "economy" ? flight.price_economy_infant : flight.price_business_infant) ?? adult;
  }
  return adult;
}

/** Subtotal of one leg for a mixed list of passenger types. */
export function legSubtotal(
  flight: FareFields,
  cabin: CabinClass,
  passengers: { passenger_type: PassengerType }[]
): number {
  return passengers.reduce((sum, p) => sum + fareFor(flight, cabin, p.passenger_type), 0);
}
