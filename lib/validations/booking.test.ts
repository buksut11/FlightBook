import { describe, it, expect } from "vitest";
import { newBookingSchema } from "./booking";

const valid = {
  flight_id: "11111111-1111-1111-1111-111111111111",
  cabin_class: "economy",
  customer: { full_name: "Asha Ali", phone: "0907000001", email: "" },
  passengers: [{ full_name: "Asha Ali", id_number: "", passenger_type: "adult" }],
};

describe("newBookingSchema", () => {
  it("accepts a valid one-way booking", () => {
    expect(newBookingSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects zero passengers", () => {
    expect(newBookingSchema.safeParse({ ...valid, passengers: [] }).success).toBe(false);
  });
  it("rejects more than 9 passengers", () => {
    const p = Array.from({ length: 10 }, (_, i) => ({
      full_name: `P ${i}`, id_number: "", passenger_type: "adult",
    }));
    expect(newBookingSchema.safeParse({ ...valid, passengers: p }).success).toBe(false);
  });
  it("rejects a too-short phone", () => {
    expect(
      newBookingSchema.safeParse({ ...valid, customer: { ...valid.customer, phone: "12" } }).success
    ).toBe(false);
  });
  it("rejects an invalid cabin class", () => {
    expect(newBookingSchema.safeParse({ ...valid, cabin_class: "first" }).success).toBe(false);
  });
});
