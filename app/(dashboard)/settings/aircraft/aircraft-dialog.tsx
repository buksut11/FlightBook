"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { saveAircraft } from "./actions";
import type { Aircraft } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AircraftDialog({ aircraft }: { aircraft?: Aircraft }) {
  return (
    <EntityDialog
      title={aircraft ? `Edit ${aircraft.model}` : "Add aircraft"}
      action={saveAircraft.bind(null, aircraft?.id ?? null)}
      trigger={
        aircraft
          ? <Button variant="outline" size="sm">Edit</Button>
          : <Button>Add aircraft</Button>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="model">Model</Label>
        <Input id="model" name="model" defaultValue={aircraft?.model} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="registration">Registration (optional)</Label>
        <Input id="registration" name="registration" defaultValue={aircraft?.registration ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="seats_economy_default">Economy seats</Label>
          <Input id="seats_economy_default" name="seats_economy_default" type="number" min={0}
            defaultValue={aircraft?.seats_economy_default ?? 0} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="seats_business_default">Business seats</Label>
          <Input id="seats_business_default" name="seats_business_default" type="number" min={0}
            defaultValue={aircraft?.seats_business_default ?? 0} required />
        </div>
      </div>
    </EntityDialog>
  );
}
