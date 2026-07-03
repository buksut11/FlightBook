import { describe, it, expect } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("formats USD with two decimals", () => {
    expect(formatMoney(120, "USD")).toBe("$120.00");
  });
  it("falls back to code prefix for unknown currencies", () => {
    expect(formatMoney(50, "XXA")).toBe("XXA 50.00");
  });
});
