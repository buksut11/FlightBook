import { describe, it, expect } from "vitest";
import { airportSchema, aircraftSchema, flightSchema } from "./inventory";

describe("airportSchema", () => {
  it("uppercases and accepts a 3-letter code", () => {
    const r = airportSchema.parse({
      code: "ggr", name: "Garowe International", city: "Garowe", country: "Somalia",
    });
    expect(r.code).toBe("GGR");
  });
  it("rejects a 2-letter code", () => {
    expect(
      airportSchema.safeParse({ code: "GG", name: "X", city: "Y", country: "Z" }).success
    ).toBe(false);
  });
});

describe("aircraftSchema", () => {
  it("coerces seat counts from form strings", () => {
    const r = aircraftSchema.parse({
      model: "Fokker 50", registration: "6O-BBB",
      seats_economy_default: "46", seats_business_default: "0",
    });
    expect(r.seats_economy_default).toBe(46);
  });
  it("rejects negative seats", () => {
    expect(
      aircraftSchema.safeParse({
        model: "X", registration: "", seats_economy_default: "-1", seats_business_default: "0",
      }).success
    ).toBe(false);
  });
});

describe("flightSchema", () => {
  const base = {
    flight_number: "GX101",
    origin_airport_id: "11111111-1111-1111-1111-111111111111",
    destination_airport_id: "22222222-2222-2222-2222-222222222222",
    aircraft_id: "33333333-3333-3333-3333-333333333333",
    departure_at: "2026-08-01T08:00",
    arrival_at: "2026-08-01T09:30",
    price_economy: "120", price_business: "200",
    seats_total_economy: "26", seats_total_business: "4",
    baggage_kg_economy: "30", baggage_kg_business: "40",
    currency: "USD",
  };
  it("accepts a valid flight", () => {
    expect(flightSchema.safeParse(base).success).toBe(true);
  });
  it("rejects same origin and destination", () => {
    expect(
      flightSchema.safeParse({ ...base, destination_airport_id: base.origin_airport_id }).success
    ).toBe(false);
  });
  it("rejects arrival before departure", () => {
    expect(
      flightSchema.safeParse({ ...base, arrival_at: "2026-08-01T07:00" }).success
    ).toBe(false);
  });
  it("allows empty business price when there are no business seats", () => {
    const r = flightSchema.safeParse({
      ...base, price_business: "", seats_total_business: "0",
    });
    expect(r.success).toBe(true);
  });
  it("requires business price when business seats exist", () => {
    expect(
      flightSchema.safeParse({ ...base, price_business: "", seats_total_business: "4" }).success
    ).toBe(false);
  });
  it("treats absent or blank tiered prices as null", () => {
    const r = flightSchema.parse({ ...base, price_economy_child: "" });
    expect(r.price_economy_child).toBeNull();
    expect(r.price_economy_infant).toBeNull();
    expect(r.price_business_child).toBeNull();
    expect(r.price_business_infant).toBeNull();
  });
  it("coerces tiered prices from form strings", () => {
    const r = flightSchema.parse({
      ...base,
      price_economy_child: "90",
      price_economy_infant: "20",
      price_business_child: "150",
      price_business_infant: "30",
    });
    expect(r.price_economy_child).toBe(90);
    expect(r.price_economy_infant).toBe(20);
    expect(r.price_business_child).toBe(150);
    expect(r.price_business_infant).toBe(30);
  });
  it("rejects negative tiered prices", () => {
    expect(
      flightSchema.safeParse({ ...base, price_economy_child: "-5" }).success
    ).toBe(false);
  });
});
