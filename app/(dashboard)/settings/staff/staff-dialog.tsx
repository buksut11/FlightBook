"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { createStaff } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StaffDialog() {
  const selectCls = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";
  return (
    <EntityDialog title="Add staff member" action={createStaff} trigger={<Button>Add staff</Button>}>
      <div className="grid gap-2">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" name="full_name" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="role">Role</Label>
        <select id="role" name="role" className={selectCls} defaultValue="agent" required>
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Temporary password</Label>
        <Input id="password" name="password" type="text" minLength={8} required />
      </div>
    </EntityDialog>
  );
}
