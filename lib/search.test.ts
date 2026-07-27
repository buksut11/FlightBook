import { describe, it, expect } from "vitest";
import { sanitizeSearchTerm, customerSearchFilter, isUuid } from "./search";

describe("sanitizeSearchTerm", () => {
  it("leaves ordinary names and phone digits alone", () => {
    expect(sanitizeSearchTerm("Asha Ali")).toBe("Asha Ali");
    expect(sanitizeSearchTerm("0907000001")).toBe("0907000001");
  });
  it("keeps apostrophes, which are not a PostgREST metacharacter", () => {
    expect(sanitizeSearchTerm("O'Brien")).toBe("O'Brien");
  });
  it("keeps non-ASCII letters", () => {
    expect(sanitizeSearchTerm("Cabdullaahi Muuse")).toBe("Cabdullaahi Muuse");
    expect(sanitizeSearchTerm("Zoë")).toBe("Zoë");
  });

  it("strips the comma that would close the filter term", () => {
    expect(sanitizeSearchTerm("x,id.not.is.null")).toBe("xidnotisnull");
  });
  it("strips parentheses used for grouping", () => {
    expect(sanitizeSearchTerm("a),or(id.gt.0")).toBe("aoridgt0");
  });
  it("strips the dot that separates column/operator/value", () => {
    expect(sanitizeSearchTerm("notes.ilike.%secret%")).toBe("notesilikesecret");
  });
  it("strips double quotes and backslashes", () => {
    expect(sanitizeSearchTerm('a"b\\c')).toBe("abc");
  });
  it("strips colons used for casts", () => {
    expect(sanitizeSearchTerm("id::text")).toBe("idtext");
  });
  it("strips SQL LIKE wildcards so input matches literally", () => {
    expect(sanitizeSearchTerm("%_%")).toBe("");
    expect(sanitizeSearchTerm("a%b_c")).toBe("abc");
  });
  it("strips the asterisk PostgREST turns into a wildcard", () => {
    expect(sanitizeSearchTerm("*")).toBe("");
  });
  it("strips control characters", () => {
    expect(sanitizeSearchTerm("a\u0000b\nc\u007f")).toBe("abc");
  });
  it("trims and caps length", () => {
    expect(sanitizeSearchTerm("   spaced   ")).toBe("spaced");
    expect(sanitizeSearchTerm("a".repeat(500))).toHaveLength(100);
  });
  it("handles empty and nullish input", () => {
    expect(sanitizeSearchTerm("")).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
    expect(sanitizeSearchTerm(null)).toBe("");
  });

  it("leaves no PostgREST metacharacter in any output", () => {
    const nasty = [
      "x,id.not.is.null",
      'a"b',
      "a)or(b",
      "%_*",
      "notes.ilike.%a%",
      "id::text",
      "\\",
      ",,,...(((",
    ];
    for (const input of nasty) {
      expect(sanitizeSearchTerm(input)).not.toMatch(/[,.()"\\:*%_]/);
    }
  });
});

describe("customerSearchFilter", () => {
  it("builds a filter for a normal term", () => {
    expect(customerSearchFilter("Asha")).toBe(
      "full_name.ilike.%Asha%,phone.ilike.%Asha%"
    );
  });
  it("returns null when nothing usable remains, so no filter is applied", () => {
    expect(customerSearchFilter("%")).toBeNull();
    expect(customerSearchFilter("...")).toBeNull();
    expect(customerSearchFilter("")).toBeNull();
    expect(customerSearchFilter(undefined)).toBeNull();
  });
  it("neutralises an injected term", () => {
    const filter = customerSearchFilter("x,id.not.is.null");
    // exactly two terms, i.e. one comma, and no injected operator survived
    expect(filter!.split(",")).toHaveLength(2);
    expect(filter).toBe("full_name.ilike.%xidnotisnull%,phone.ilike.%xidnotisnull%");
  });
});

describe("isUuid", () => {
  it("accepts a v4 uuid", () => {
    expect(isUuid("f81d4fae-7dec-41d0-a765-00a0c91e6bf6")).toBe(true);
  });
  it("rejects anything that could carry filter syntax", () => {
    expect(isUuid("f81d4fae-7dec-41d0-a765-00a0c91e6bf6),or(id.gt.0")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});
