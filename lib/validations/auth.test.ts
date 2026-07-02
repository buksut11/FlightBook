import { describe, it, expect } from "vitest";
import { loginSchema } from "./auth";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "secret123" });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "secret123" });
    expect(r.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(r.success).toBe(false);
  });

  it("trims and lowercases the email", () => {
    const r = loginSchema.parse({ email: "  A@B.COM ", password: "secret123" });
    expect(r.email).toBe("a@b.com");
  });
});
