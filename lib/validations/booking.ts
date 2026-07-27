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

export const newBookingSchema = z
  .object({
    flight_id: uuidField(),
    cabin_class: z.enum(["economy", "business"]),
    customer: customerInputSchema,
    passengers: z.array(passengerSchema).min(1, "Add at least one passenger").max(9),
    return_flight_id: uuidField().optional(),
    return_cabin_class: z.enum(["economy", "business"]).optional(),
    discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
    discount_value: z.coerce.number().min(0).default(0),
    discount_reason: z.string().trim().optional().or(z.literal("")),
    extra_baggage_kg: z.coerce.number().int().min(0).default(0),
    extra_baggage_fee: z.coerce.number().min(0).default(0),
  })
  .refine((d) => !d.return_flight_id || !!d.return_cabin_class, {
    message: "Choose a cabin class for the return flight",
    path: ["return_cabin_class"],
  })
  .refine((d) => d.discount_type === "none" || d.discount_value > 0, {
    message: "Enter a discount value",
    path: ["discount_value"],
  })
  .refine((d) => d.discount_type !== "percent" || d.discount_value <= 100, {
    message: "A percentage discount cannot exceed 100",
    path: ["discount_value"],
  });

export type PassengerInput = z.infer<typeof passengerSchema>;
// Input shape (pre-parse): fields with defaults are optional for callers.
export type NewBookingInput = z.input<typeof newBookingSchema>;
