"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { createStaff } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const roleItems = [
  { value: "agent", label: "Agent" },
  { value: "admin", label: "Admin" },
];

export function StaffDialog() {
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
        <Select name="role" defaultValue="agent" required items={roleItems}>
          <SelectTrigger id="role" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleItems.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Temporary password</Label>
        <Input id="password" name="password" type="text" minLength={8} required />
      </div>
    </EntityDialog>
  );
}
