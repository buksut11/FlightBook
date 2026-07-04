import { describe, it, expect } from "vitest";
import { createStaffSchema, updateProfileSchema } from "./staff";

describe("createStaffSchema", () => {
  it("accepts a valid new agent", () => {
    const r = createStaffSchema.safeParse({
      full_name: "Sahra Yusuf", email: "sahra@agency.so", phone: "0907000010",
      role: "agent", password: "secret123",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a short password", () => {
    expect(createStaffSchema.safeParse({
      full_name: "X Y", email: "x@y.com", role: "agent", password: "short",
    }).success).toBe(false);
  });
  it("rejects an invalid role", () => {
    expect(createStaffSchema.safeParse({
      full_name: "X Y", email: "x@y.com", role: "superuser", password: "secret123",
    }).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts name and phone", () => {
    expect(updateProfileSchema.safeParse({ full_name: "New Name", phone: "0901112222" }).success).toBe(true);
  });
  it("rejects an empty name", () => {
    expect(updateProfileSchema.safeParse({ full_name: "", phone: "" }).success).toBe(false);
  });
});
