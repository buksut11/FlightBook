import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Customer, CustomerBalance } from "@/lib/types/database";
import { SearchInput } from "./search-input";
import { formatMoney } from "@/lib/format";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await getProfile();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data: customers } = await query;

  const balances = new Map<string, CustomerBalance>();
  if (customers && customers.length > 0) {
    const { data: balRows } = await supabase
      .from("customer_balances")
      .select("*")
      .in("customer_id", customers.map((c) => c.id));
    for (const row of (balRows ?? []) as CustomerBalance[]) {
      balances.set(row.customer_id, row);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Customers</h1>
      <div className="mt-4">
        <SearchInput placeholder="Search by name or phone…" />
      </div>
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Outstanding</TableHead>
            <TableHead>Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(customers as Customer[] | null)?.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">
                  {c.full_name}
                </Link>
              </TableCell>
              <TableCell>{c.phone}</TableCell>
              <TableCell>{c.email ?? "—"}</TableCell>
              <TableCell>
                {(() => {
                  const bal = balances.get(c.id);
                  if (!bal || bal.outstanding <= 0) {
                    return <span className="text-muted-foreground">—</span>;
                  }
                  return (
                    <span className="font-medium text-amber-600 dark:text-amber-500">
                      {formatMoney(bal.outstanding, bal.currency ?? "USD")}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(c.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {(customers ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No customers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
