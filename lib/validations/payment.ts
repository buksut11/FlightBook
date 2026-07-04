import { z } from "zod";

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  method: z.enum(["evc_plus", "zaad", "sahal", "cash", "other"]),
  transaction_ref: z.string().trim().optional().or(z.literal("")),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
