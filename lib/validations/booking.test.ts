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

describe("newBookingSchema — round trip & extras", () => {
  const base = {
    flight_id: "11111111-1111-1111-1111-111111111111",
    cabin_class: "economy",
    customer: { full_name: "Asha Ali", phone: "0907000001", email: "" },
    passengers: [{ full_name: "Asha Ali", id_number: "", passenger_type: "adult" }],
  };

  it("accepts a round trip with a return flight and cabin class", () => {
    const r = newBookingSchema.safeParse({
      ...base,
      return_flight_id: "22222222-2222-2222-2222-222222222222",
      return_cabin_class: "economy",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a return flight without a return cabin class", () => {
    const r = newBookingSchema.safeParse({
      ...base,
      return_flight_id: "22222222-2222-2222-2222-222222222222",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a percent discount with a reason", () => {
    const r = newBookingSchema.safeParse({
      ...base, discount_type: "percent", discount_value: "10", discount_reason: "loyal customer",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a negative discount value", () => {
    const r = newBookingSchema.safeParse({ ...base, discount_type: "fixed", discount_value: "-5" });
    expect(r.success).toBe(false);
  });

  it("accepts extra baggage kg and fee", () => {
    const r = newBookingSchema.safeParse({ ...base, extra_baggage_kg: "10", extra_baggage_fee: "15" });
    expect(r.success).toBe(true);
  });

  it("defaults discount_type to none and extras to zero when omitted", () => {
    const r = newBookingSchema.parse(base);
    expect(r.discount_type).toBe("none");
    expect(r.extra_baggage_kg).toBe(0);
    expect(r.extra_baggage_fee).toBe(0);
  });
});

describe("newBookingSchema — discount bounds (0011)", () => {
  const base = {
    flight_id: "11111111-1111-1111-1111-111111111111",
    cabin_class: "economy",
    customer: { full_name: "Asha Ali", phone: "0907000001", email: "" },
    passengers: [{ full_name: "Asha Ali", id_number: "", passenger_type: "adult" }],
  };

  it("accepts a percentage discount at the 100 boundary", () => {
    expect(
      newBookingSchema.safeParse({ ...base, discount_type: "percent", discount_value: 100 }).success
    ).toBe(true);
  });
  it("rejects a percentage discount above 100", () => {
    expect(
      newBookingSchema.safeParse({ ...base, discount_type: "percent", discount_value: 101 }).success
    ).toBe(false);
  });
  it("still allows a fixed discount above 100 (it is an amount, not a rate)", () => {
    expect(
      newBookingSchema.safeParse({ ...base, discount_type: "fixed", discount_value: 250 }).success
    ).toBe(true);
  });
  it("rejects a negative discount", () => {
    expect(
      newBookingSchema.safeParse({ ...base, discount_type: "percent", discount_value: -5 }).success
    ).toBe(false);
  });
});
