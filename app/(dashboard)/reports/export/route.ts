import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { rpcErrorText } from "@/lib/rpc-errors";

export const runtime = "nodejs";

/**
 * Render one CSV cell.
 *
 * Two separate concerns, both required:
 *
 * 1. Quoting, so delimiters inside a value do not break the row.
 * 2. Formula-injection defence (CWE-1236). Excel, LibreOffice Calc and Google
 *    Sheets evaluate any cell whose text begins with `=`, `+`, `-`, `@`, tab
 *    or CR as a formula, and quoting does not stop that. The `agent` column is
 *    `profiles.full_name`, which every staff member can set on themselves via
 *    updateProfile with no character restrictions — so an agent can rename
 *    themselves to a HYPERLINK/DDE/IMPORTXML payload and wait for an admin to
 *    open the export. Prefixing an apostrophe makes the spreadsheet treat the
 *    value as text; the apostrophe is not displayed in the cell.
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * report_summary takes `date` parameters, so anything that is not an ISO date
 * is both a database error waiting to happen and attacker-controlled text
 * flowing into the CSV body and the Content-Disposition filename. Validate
 * once, here, and reject rather than sanitize — there is no sensible
 * interpretation of a malformed date.
 */
export function parseIsoDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // reject values that round-trip differently, e.g. 2026-02-31
  return d.toISOString().slice(0, 10) === value ? value : null;
}

export async function GET(req: NextRequest) {
  await requireAdmin();

  const from = parseIsoDate(req.nextUrl.searchParams.get("from"));
  const to = parseIsoDate(req.nextUrl.searchParams.get("to"));
  if (!from || !to) {
    return new NextResponse(
      "Invalid date range. Provide from and to as YYYY-MM-DD.",
      { status: 400, headers: { "Content-Type": "text/plain" } }
    );
  }
  if (from > to) {
    return new NextResponse("The start date must not be after the end date.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_summary", { p_from: from, p_to: to });
  if (error) {
    return new NextResponse(`Report export failed: ${rpcErrorText(error, "report_summary")}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const r = (data ?? {}) as {
    total_revenue: number; bookings_count: number; discounts_total: number;
    by_agent: { agent: string; bookings: number; revenue: number }[];
    by_method: { method: string; count: number; total: number }[];
  };

  const lines: string[] = [];
  lines.push(["Report", csvCell(`${from} to ${to}`)].join(","));
  lines.push("");
  lines.push("Summary");
  lines.push(["Total revenue", csvCell(r.total_revenue ?? 0)].join(","));
  lines.push(["Bookings", csvCell(r.bookings_count ?? 0)].join(","));
  lines.push(["Discounts given", csvCell(r.discounts_total ?? 0)].join(","));
  lines.push("");
  lines.push("By agent");
  lines.push("Agent,Bookings,Revenue");
  for (const a of r.by_agent ?? []) {
    lines.push([csvCell(a.agent), csvCell(a.bookings), csvCell(a.revenue)].join(","));
  }
  lines.push("");
  lines.push("By payment method");
  lines.push("Method,Count,Total");
  for (const m of r.by_method ?? []) {
    lines.push([csvCell(m.method), csvCell(m.count), csvCell(m.total)].join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      // from/to are validated ISO dates above, so the filename cannot carry
      // quotes or newlines into the header
      "Content-Disposition": `attachment; filename="report-${from}-to-${to}.csv"`,
    },
  });
}
