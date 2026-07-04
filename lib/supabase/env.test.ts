import { describe, it, expect } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the value when set", () => {
    expect(
      requireEnv("https://x.supabase.co", "NEXT_PUBLIC_SUPABASE_URL")
    ).toBe("https://x.supabase.co");
  });

  it("throws naming the variable when undefined", () => {
    expect(() =>
      requireEnv(undefined, "NEXT_PUBLIC_SUPABASE_URL")
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws naming the variable when empty", () => {
    expect(() =>
      requireEnv("", "SUPABASE_SERVICE_ROLE_KEY")
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
