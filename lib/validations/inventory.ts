import { z } from "zod";

export const airportSchema = z.object({
  code: z.string().trim().toUpperCase().length(3, "Code must be 3 letters"),
  name: z.string().trim().min(2),
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
});

export const aircraftSchema = z.object({
  model: z.string().trim().min(2),
  registration: z.string().trim().optional().or(z.literal("")),
  seats_economy_default: z.coerce.number().int().min(0),
  seats_business_default: z.coerce.number().int().min(0),
});

// Postgres accepts any hex UUID; zod's .uuid() rejects non-RFC-4122 version bits.
const uuidField = (message: string) =>
  z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, message);

// Optional fare fields arrive as "" from empty form inputs; store as null.
const optionalPrice = () =>
  z
    .union([z.literal(""), z.coerce.number().min(0)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const flightSchema = z
  .object({
    flight_number: z.string().trim().min(2).toUpperCase(),
    origin_airport_id: uuidField("Choose an origin"),
    destination_airport_id: uuidField("Choose a destination"),
    aircraft_id: uuidField("Choose an aircraft"),
    departure_at: z.string().min(1, "Departure time required"),
    arrival_at: z.string().min(1, "Arrival time required"),
    price_economy: z.coerce.number().min(0),
    price_business: optionalPrice(),
    price_economy_child: optionalPrice(),
    price_economy_infant: optionalPrice(),
    price_business_child: optionalPrice(),
    price_business_infant: optionalPrice(),
    seats_total_economy: z.coerce.number().int().min(0),
    seats_total_business: z.coerce.number().int().min(0),
    baggage_kg_economy: z.coerce.number().int().min(0),
    baggage_kg_business: z.coerce.number().int().min(0),
    currency: z.string().trim().min(3).max(3).toUpperCase(),
  })
  .refine((d) => d.origin_airport_id !== d.destination_airport_id, {
    message: "Origin and destination must be different",
    path: ["destination_airport_id"],
  })
  .refine((d) => new Date(d.arrival_at) > new Date(d.departure_at), {
    message: "Arrival must be after departure",
    path: ["arrival_at"],
  })
  .refine((d) => d.seats_total_business === 0 || d.price_business !== null, {
    message: "Business price required when business seats exist",
    path: ["price_business"],
  });

export type FlightInput = z.infer<typeof flightSchema>;
