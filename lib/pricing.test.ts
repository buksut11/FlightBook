import { describe, it, expect } from "vitest";
import { fareFor, legSubtotal, type FareFields } from "./pricing";

const flight: FareFields = {
  price_economy: 120,
  price_business: 200,
  price_economy_child: 90,
  price_economy_infant: 20,
  price_business_child: 150,
  price_business_infant: 30,
};

const noTiers: FareFields = {
  price_economy: 120,
  price_business: 200,
  price_economy_child: null,
  price_economy_infant: null,
  price_business_child: null,
  price_business_infant: null,
};

describe("fareFor", () => {
  it("uses the per-type fare when defined", () => {
    expect(fareFor(flight, "economy", "adult")).toBe(120);
    expect(fareFor(flight, "economy", "child")).toBe(90);
    expect(fareFor(flight, "economy", "infant")).toBe(20);
    expect(fareFor(flight, "business", "child")).toBe(150);
    expect(fareFor(flight, "business", "infant")).toBe(30);
  });

  it("falls back to the adult fare when a tier is not set", () => {
    expect(fareFor(noTiers, "economy", "child")).toBe(120);
    expect(fareFor(noTiers, "business", "infant")).toBe(200);
  });

  it("treats a missing business fare as 0", () => {
    const economyOnly = { ...noTiers, price_business: null };
    expect(fareFor(economyOnly, "business", "adult")).toBe(0);
    expect(fareFor(economyOnly, "business", "child")).toBe(0);
  });
});

describe("legSubtotal", () => {
  it("sums per-passenger fares by type", () => {
    const pax = [
      { passenger_type: "adult" as const },
      { passenger_type: "adult" as const },
      { passenger_type: "child" as const },
      { passenger_type: "infant" as const },
    ];
    expect(legSubtotal(flight, "economy", pax)).toBe(120 + 120 + 90 + 20);
    expect(legSubtotal(flight, "business", pax)).toBe(200 + 200 + 150 + 30);
  });

  it("matches the flat price × count when no tiers are set", () => {
    const pax = Array.from({ length: 3 }, () => ({ passenger_type: "child" as const }));
    expect(legSubtotal(noTiers, "economy", pax)).toBe(360);
  });
});
