"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { resetStaffPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetDialog({ id, name }: { id: string; name: string }) {
  return (
    <EntityDialog
      title={`Reset password for ${name}`}
      action={resetStaffPassword.bind(null, id)}
      trigger={<Button variant="outline" size="sm">Reset password</Button>}
    >
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="text" minLength={8} required />
      </div>
    </EntityDialog>
  );
}
