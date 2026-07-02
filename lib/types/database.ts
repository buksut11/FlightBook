export type Role = "admin" | "agent";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CabinClass = "economy" | "business";
export type TripType = "one_way" | "round_trip";
export type BookingStatus = "pending" | "confirmed" | "cancelled";
export type FlightStatus = "scheduled" | "departed" | "cancelled";
export type PaymentMethod = "evc_plus" | "zaad" | "sahal" | "cash" | "other";
export type PassengerType = "adult" | "child" | "infant";
export type DiscountType = "none" | "percent" | "fixed";

export interface Airport {
  id: string;
  code: string;
  name: string;
  city: string;
  country: string;
  created_at: string;
}

export interface Aircraft {
  id: string;
  model: string;
  registration: string | null;
  seats_economy_default: number;
  seats_business_default: number;
  created_at: string;
}

export interface Flight {
  id: string;
  flight_number: string;
  origin_airport_id: string;
  destination_airport_id: string;
  aircraft_id: string | null;
  departure_at: string;
  arrival_at: string;
  price_economy: number;
  price_business: number | null;
  seats_total_economy: number;
  seats_available_economy: number;
  seats_total_business: number;
  seats_available_business: number;
  baggage_kg_economy: number;
  baggage_kg_business: number;
  currency: string;
  status: FlightStatus;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  reference: string;
  flight_id: string;
  customer_id: string;
  created_by: string;
  cabin_class: CabinClass;
  passenger_count: number;
  trip_type: TripType;
  linked_booking_id: string | null;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_reason: string | null;
  extra_baggage_kg: number;
  extra_baggage_fee: number;
  total_amount: number;
  currency: string;
  status: BookingStatus;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Passenger {
  id: string;
  booking_id: string;
  full_name: string;
  id_number: string | null;
  passenger_type: PassengerType;
  created_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  method: PaymentMethod;
  transaction_ref: string | null;
  received_by: string;
  received_at: string;
}

export interface BookingEvent {
  id: string;
  booking_id: string;
  actor_id: string | null;
  event: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateBookingResult {
  booking_id: string;
  reference: string;
  return_booking_id: string | null;
  return_reference: string | null;
  combined_total: number;
}
