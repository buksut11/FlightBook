import { z } from "zod";

// Postgres accepts any hex UUID; zod's .uuid() rejects non-RFC-4122 version bits.
const uuidField = () =>
  z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

export const passengerSchema = z.object({
  full_name: z.string().trim().min(2, "Passenger name required"),
  id_number: z.string().trim().optional().or(z.literal("")),
  passenger_type: z.enum(["adult", "child", "infant"]),
});

export const customerInputSchema = z.object({
  id: uuidField().optional(),
  full_name: z.string().trim().min(2, "Customer name required"),
  phone: z.string().trim().min(6, "Phone number required"),
  email: z.string().trim().email().optional().or(z.literal("")),
});

export const newBookingSchema = z.object({
  flight_id: uuidField(),
  cabin_class: z.enum(["economy", "business"]),
  customer: customerInputSchema,
  passengers: z.array(passengerSchema).min(1, "Add at least one passenger").max(9),
});

export type PassengerInput = z.infer<typeof passengerSchema>;
export type NewBookingInput = z.infer<typeof newBookingSchema>;
