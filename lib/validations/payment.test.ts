import { describe, it, expect } from "vitest";
import { paymentSchema } from "./payment";

describe("paymentSchema", () => {
  it("accepts a valid cash payment", () => {
    const r = paymentSchema.safeParse({ amount: "120.00", method: "cash", transaction_ref: "" });
    expect(r.success).toBe(true);
  });
  it("coerces amount to a number", () => {
    const r = paymentSchema.parse({ amount: "50", method: "evc_plus", transaction_ref: "TXN1" });
    expect(r.amount).toBe(50);
  });
  it("rejects zero or negative amounts", () => {
    expect(paymentSchema.safeParse({ amount: "0", method: "cash" }).success).toBe(false);
    expect(paymentSchema.safeParse({ amount: "-5", method: "cash" }).success).toBe(false);
  });
  it("rejects an invalid method", () => {
    expect(paymentSchema.safeParse({ amount: "10", method: "paypal" }).success).toBe(false);
  });
});
