import { describe, it, expect } from "vitest";
import { mapRpcError } from "./rpc-errors";

describe("mapRpcError", () => {
  it("maps SOLD_OUT with flight and seat count", () => {
    expect(mapRpcError("SOLD_OUT:GX101:2")).toBe(
      "Only 2 seat(s) left in that class on GX101."
    );
  });
  it("maps SOLD_OUT with zero seats", () => {
    expect(mapRpcError("SOLD_OUT:GX102:0")).toBe(
      "Only 0 seat(s) left in that class on GX102."
    );
  });
  it("maps NO_BUSINESS_CABIN", () => {
    expect(mapRpcError("NO_BUSINESS_CABIN:GX101")).toBe(
      "GX101 has no business cabin."
    );
  });
  it("maps FLIGHT_NOT_BOOKABLE", () => {
    expect(mapRpcError("FLIGHT_NOT_BOOKABLE:GX104")).toBe(
      "GX104 is not open for booking."
    );
  });
  it("maps PAY_ON_OUTBOUND", () => {
    expect(mapRpcError("PAY_ON_OUTBOUND:TKT-ABC234")).toBe(
      "Record this payment on the outbound leg (TKT-ABC234)."
    );
  });
  it("maps RETURN_BEFORE_OUTBOUND", () => {
    expect(mapRpcError("RETURN_BEFORE_OUTBOUND:GX102")).toBe(
      "The return flight GX102 departs before the outbound flight."
    );
  });
  it("falls back for unknown errors without leaking internals", () => {
    expect(mapRpcError('duplicate key value violates unique constraint "x"')).toBe(
      "Something went wrong. Please try again."
    );
  });
});
