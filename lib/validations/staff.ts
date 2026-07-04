import { z } from "zod";

export const createStaffSchema = z.object({
  full_name: z.string().trim().min(2, "Name required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  phone: z.string().trim().optional().or(z.literal("")),
  role: z.enum(["admin", "agent"]),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, "Name required"),
  phone: z.string().trim().optional().or(z.literal("")),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
