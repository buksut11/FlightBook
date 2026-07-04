import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";

  const supabase = await createClient();
  const { data } = await supabase.rpc("report_summary", { p_from: from, p_to: to });
  const r = (data ?? {}) as {
    total_revenue: number; bookings_count: number; discounts_total: number;
    by_agent: { agent: string; bookings: number; revenue: number }[];
    by_method: { method: string; count: number; total: number }[];
  };

  const lines: string[] = [];
  lines.push(`Report,${from} to ${to}`);
  lines.push("");
  lines.push("Summary");
  lines.push(`Total revenue,${r.total_revenue ?? 0}`);
  lines.push(`Bookings,${r.bookings_count ?? 0}`);
  lines.push(`Discounts given,${r.discounts_total ?? 0}`);
  lines.push("");
  lines.push("By agent");
  lines.push("Agent,Bookings,Revenue");
  for (const a of r.by_agent ?? []) {
    lines.push([csvCell(a.agent), a.bookings, a.revenue].join(","));
  }
  lines.push("");
  lines.push("By payment method");
  lines.push("Method,Count,Total");
  for (const m of r.by_method ?? []) {
    lines.push([csvCell(m.method), m.count, m.total].join(","));
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="report-${from}-to-${to}.csv"`,
    },
  });
}
