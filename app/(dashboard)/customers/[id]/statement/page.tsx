import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Customer, CustomerBalance, StatementEntry } from "@/lib/types/database";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getProfile();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: customer }, { data: summary }, { data: entryRows }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("customer_balances").select("*").eq("customer_id", id).maybeSingle(),
    supabase
      .from("customer_statement_entries")
      .select("*")
      .eq("customer_id", id)
      .order("entry_at")
      .order("debit", { ascending: false }),
  ]);

  if (!customer) notFound();
  const c = customer as Customer;
  const s = summary as CustomerBalance | null;
  const entries = (entryRows ?? []) as StatementEntry[];
  const currency = s?.currency ?? entries[0]?.currency ?? "USD";

  // Running balance: charges add to what the customer owes, payments and
  // carried-forward credits reduce it.
  let running = 0;
  const ledger = entries.map((e) => {
    running += e.debit - e.credit;
    return { ...e, running };
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Statement — {c.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {c.phone}
            {c.email ? ` · ${c.email}` : ""}
          </p>
        </div>
        <Link href={`/customers/${c.id}`} className="text-sm text-primary hover:underline">
          Customer profile →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total charged</p>
            <p className="text-lg font-semibold">{formatMoney(s?.total_charged ?? 0, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total paid</p>
            <p className="text-lg font-semibold">{formatMoney(s?.total_paid ?? 0, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p
              className={
                "text-lg font-semibold " +
                ((s?.outstanding ?? 0) > 0
                  ? "text-amber-600 dark:text-amber-500"
                  : "text-green-600 dark:text-green-500")
              }
            >
              {formatMoney(s?.outstanding ?? 0, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Booking</TableHead>
              <TableHead className="text-right">Charged</TableHead>
              <TableHead className="text-right">Paid / credited</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((e, i) => (
              <TableRow key={`${e.entry_type}-${e.booking_id}-${i}`}>
                <TableCell className="whitespace-nowrap">{formatDateTime(e.entry_at)}</TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell>
                  <Link
                    href={`/bookings/${e.booking_id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {e.reference}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  {e.debit > 0 ? formatMoney(e.debit, e.currency) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {e.credit > 0 ? formatMoney(e.credit, e.currency) : "—"}
                </TableCell>
                <TableCell
                  className={
                    "text-right font-medium " +
                    (e.running > 0 ? "text-amber-600 dark:text-amber-500" : "")
                  }
                >
                  {formatMoney(e.running, e.currency)}
                </TableCell>
              </TableRow>
            ))}
            {ledger.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
