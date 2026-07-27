import { describe, it, expect } from "vitest";
import { mapRpcError, rpcErrorText } from "./rpc-errors";

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

describe("mapRpcError — 0011 security limits", () => {
  it("maps DISCOUNT_NEEDS_ADMIN with the ceiling", () => {
    expect(mapRpcError("DISCOUNT_NEEDS_ADMIN:10")).toBe(
      "Discounts above 10% need an admin. Ask an admin to make this booking."
    );
  });
  it("maps TOO_MANY_PASSENGERS with the cap", () => {
    expect(mapRpcError("TOO_MANY_PASSENGERS:9")).toBe(
      "A booking can hold at most 9 passengers."
    );
  });
  it("maps OVERPAYMENT with the outstanding balance", () => {
    expect(mapRpcError("OVERPAYMENT:250.00")).toBe(
      "That is more than this booking owes (250.00 outstanding)."
    );
  });
  it("maps INVALID_DISCOUNT", () => {
    expect(mapRpcError("INVALID_DISCOUNT")).toContain("between 0 and 100");
  });
  it("maps NOTHING_OWED", () => {
    expect(mapRpcError("NOTHING_OWED")).toBe("This booking is already paid in full.");
  });
  it("maps INVALID_AMOUNT", () => {
    expect(mapRpcError("INVALID_AMOUNT")).toBe("Enter a payment amount greater than zero.");
  });
  it("maps INVALID_PASSENGER_TYPE", () => {
    expect(mapRpcError("INVALID_PASSENGER_TYPE")).toBe(
      "Each passenger must be an adult, child, or infant."
    );
  });
  it("maps PASSENGER_NAME_REQUIRED", () => {
    expect(mapRpcError("PASSENGER_NAME_REQUIRED")).toBe("Every passenger needs a name.");
  });
  it("maps INVALID_BAGGAGE", () => {
    expect(mapRpcError("INVALID_BAGGAGE")).toContain("cannot be negative");
  });
  it("maps PROTECTED_COLUMNS without exposing the RPC names", () => {
    const text = mapRpcError("PROTECTED_COLUMNS: use the booking RPC functions");
    expect(text).toBe("That change has to go through the booking actions.");
  });
  it("still maps NOT_ALLOWED, which record_payment now also raises", () => {
    expect(mapRpcError("NOT_ALLOWED")).toBe("You don't have permission to do that.");
  });
  it("finds the code when Supabase wraps the message", () => {
    expect(
      mapRpcError('failed to execute: DISCOUNT_NEEDS_ADMIN:10 (SQLSTATE P0001)')
    ).toContain("need an admin");
  });
});

describe("rpcErrorText", () => {
  it("points at the repair migration when the function is missing (PGRST202)", () => {
    const text = rpcErrorText(
      {
        code: "PGRST202",
        message:
          "Could not find the function public.report_summary(p_from, p_to) in the schema cache",
      },
      "report_summary"
    );
    expect(text).toContain("report_summary()");
    expect(text).toContain("0010_reporting_fixes.sql");
  });
  it("detects a missing function from the message alone", () => {
    const text = rpcErrorText(
      { message: "Could not find the function public.dashboard_summary in the schema cache" },
      "dashboard_summary"
    );
    expect(text).toContain("dashboard_summary()");
  });
  it("points at the migrations when a table or view is missing (42P01)", () => {
    const text = rpcErrorText(
      { code: "42P01", message: 'relation "public.customer_balances" does not exist' },
      "customer balances"
    );
    expect(text).toContain("customer balances");
    expect(text).toContain("supabase/migrations");
  });
  it("points at migration 0009 when a column is missing (42703)", () => {
    const text = rpcErrorText(
      { code: "42703", message: 'column "price_economy_child" of relation "flights" does not exist' },
      "flights"
    );
    expect(text).toContain("0009_tiered_pricing_and_statements.sql");
  });
  it("points at the migrations when an embed relationship is missing (PGRST200)", () => {
    const text = rpcErrorText(
      {
        code: "PGRST200",
        message: "Could not find a relationship between 'flights' and 'airports' in the schema cache",
      },
      "the flight list"
    );
    expect(text).toContain("the flight list");
    expect(text).toContain("supabase/migrations");
  });
  it("maps NOT_ADMIN", () => {
    expect(rpcErrorText({ message: "NOT_ADMIN" }, "report_summary")).toBe(
      "Only admins can view reports."
    );
  });
  it("maps NOT_STAFF", () => {
    expect(rpcErrorText({ message: "NOT_STAFF" }, "dashboard_summary")).toBe(
      "Your account is not an active staff account."
    );
  });
  it("shows the raw message for other errors", () => {
    expect(rpcErrorText({ message: "connection refused" }, "report_summary")).toBe(
      "connection refused"
    );
  });
  it("falls back when there is no message", () => {
    expect(rpcErrorText({}, "report_summary")).toBe(
      "Something went wrong loading this data."
    );
  });
});
