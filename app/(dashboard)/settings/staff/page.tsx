import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";
import { StaffDialog } from "./staff-dialog";
import { ResetDialog } from "./reset-dialog";
import { ConfirmButton } from "@/components/confirm-button";
import { setStaffActive } from "./actions";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function StaffPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data: staff } = await supabase.from("profiles").select("*").order("full_name");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Staff</h1>
        <StaffDialog />
      </div>
      <Table className="mt-4">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(staff as Profile[] | null)?.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">
                {s.full_name}{s.id === me.id ? " (you)" : ""}
              </TableCell>
              <TableCell className="capitalize">{s.role}</TableCell>
              <TableCell>
                <Badge variant="outline" className={s.is_active ? "border-green-600 text-green-600" : "border-red-600 text-red-600"}>
                  {s.is_active ? "active" : "inactive"}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                <ResetDialog id={s.id} name={s.full_name} />
                {s.id !== me.id && (
                  s.is_active ? (
                    <ConfirmButton
                      action={setStaffActive.bind(null, s.id, false)}
                      label="Deactivate"
                      confirmTitle={`Deactivate ${s.full_name}?`}
                      confirmText="They will be signed out and unable to log in until reactivated."
                    />
                  ) : (
                    <ConfirmButton
                      action={setStaffActive.bind(null, s.id, true)}
                      label="Reactivate"
                      variant="outline"
                      confirmTitle={`Reactivate ${s.full_name}?`}
                      confirmText="They will be able to log in again."
                    />
                  )
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
