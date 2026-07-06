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
