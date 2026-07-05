import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { CustomerBalance } from "@/lib/types/database";
import { SearchInput } from "../customers/search-input";
import { formatMoney } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await getProfile();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customer_balances")
    .select("*")
    .order("outstanding", { ascending: false })
    .order("full_name")
    .limit(200);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as CustomerBalance[];

  const currency = rows.find((r) => r.currency)?.currency ?? "USD";
  const totals = rows.reduce(
    (acc, r) => ({
      charged: acc.charged + r.total_charged,
      paid: acc.paid + r.total_paid,
      outstanding: acc.outstanding + Math.max(0, r.outstanding),
    }),
    { charged: 0, paid: 0, outstanding: 0 }
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">Customer statements</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Financial summary per customer: everything billed, everything paid, and what is still owed.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total charged</p>
            <p className="text-lg font-semibold">{formatMoney(totals.charged, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total collected</p>
            <p className="text-lg font-semibold">{formatMoney(totals.paid, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total outstanding</p>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-500">
              {formatMoney(totals.outstanding, currency)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <SearchInput placeholder="Search by name or phone…" />
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Total charged</TableHead>
              <TableHead>Total paid</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.customer_id}>
                <TableCell>
                  <Link
                    href={`/customers/${r.customer_id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.full_name}
                  </Link>
                </TableCell>
                <TableCell>{r.phone}</TableCell>
                <TableCell>{formatMoney(r.total_charged, r.currency ?? currency)}</TableCell>
                <TableCell>{formatMoney(r.total_paid, r.currency ?? currency)}</TableCell>
                <TableCell>
                  {r.outstanding > 0 ? (
                    <span className="font-medium text-amber-600 dark:text-amber-500">
                      {formatMoney(r.outstanding, r.currency ?? currency)}
                    </span>
                  ) : (
                    <span className="text-green-600 dark:text-green-500">
                      {formatMoney(0, r.currency ?? currency)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/customers/${r.customer_id}/statement`}
                    className="text-sm text-primary hover:underline"
                  >
                    View statement
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
