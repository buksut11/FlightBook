"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { saveAirport } from "./actions";
import type { Airport } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AirportDialog({ airport }: { airport?: Airport }) {
  return (
    <EntityDialog
      title={airport ? `Edit ${airport.code}` : "Add airport"}
      action={saveAirport.bind(null, airport?.id ?? null)}
      trigger={
        airport
          ? <Button variant="outline" size="sm">Edit</Button>
          : <Button>Add airport</Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="code">Code (3 letters)</Label>
        <Input id="code" name="code" defaultValue={airport?.code} maxLength={3} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">Airport name</Label>
        <Input id="name" name="name" defaultValue={airport?.name} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="city">City</Label>
        <Input id="city" name="city" defaultValue={airport?.city} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="country">Country</Label>
        <Input id="country" name="country" defaultValue={airport?.country} required />
      </div>
    </EntityDialog>
  );
}
