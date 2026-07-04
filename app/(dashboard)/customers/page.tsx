import Link from "next/link";
import { getProfile } from "@/lib/auth/get-profile";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/database";
import { SearchInput } from "./search-input";
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
              <TableCell className="text-muted-foreground">
                {new Date(c.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {(customers ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No customers found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
