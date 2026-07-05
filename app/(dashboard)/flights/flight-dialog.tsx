"use client";

import { useState } from "react";
import { EntityDialog } from "@/components/entity-dialog";
import { saveFlight } from "./actions";
import { createAirport } from "../settings/airports/actions";
import type { Aircraft, Airport, Flight } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ADD_NEW_CITY = "__add_new_city__";
const emptyCity = { code: "", name: "", city: "", country: "" };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FlightDialog({
  flight,
  airports,
  fleet,
}: {
  flight?: Flight;
  airports: Airport[];
  fleet: Aircraft[];
}) {
  const [airportList, setAirportList] = useState(airports);
  const [origin, setOrigin] = useState<string | null>(flight?.origin_airport_id ?? null);
  const [destination, setDestination] = useState<string | null>(flight?.destination_airport_id ?? null);
  const [aircraftId, setAircraftId] = useState<string | null>(flight?.aircraft_id ?? null);
  const [ecoSeats, setEcoSeats] = useState(String(flight?.seats_total_economy ?? 0));
  const [busSeats, setBusSeats] = useState(String(flight?.seats_total_business ?? 0));
  const [addingFor, setAddingFor] = useState<"origin" | "destination" | null>(null);
  const [newCity, setNewCity] = useState(emptyCity);
  const [cityError, setCityError] = useState<string | null>(null);
  const [savingCity, setSavingCity] = useState(false);

  const airportItems = airportList.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.city}`,
  }));
  const aircraftItems = fleet.map((a) => ({
    value: a.id,
    label: `${a.model}${a.registration ? ` (${a.registration})` : ""}`,
  }));

  function onAirportChange(field: "origin" | "destination") {
    return (value: string | null) => {
      if (value === ADD_NEW_CITY) {
        setAddingFor(field);
        return; // controlled select keeps its previous value
      }
      (field === "origin" ? setOrigin : setDestination)(value);
    };
  }

  function onAircraftChange(value: string | null) {
    setAircraftId(value);
    if (flight) return; // editing: never auto-overwrite capacity
    const craft = fleet.find((a) => a.id === value);
    if (craft) {
      setEcoSeats(String(craft.seats_economy_default));
      setBusSeats(String(craft.seats_business_default));
    }
  }

  function closeAddCity() {
    setAddingFor(null);
    setNewCity(emptyCity);
    setCityError(null);
  }

  async function addCity() {
    setSavingCity(true);
    setCityError(null);
    const fd = new FormData();
    fd.set("code", newCity.code);
    fd.set("name", newCity.name);
    fd.set("city", newCity.city);
    fd.set("country", newCity.country);
    const result = await createAirport(fd);
    if (result.ok && result.airport) {
      const created = result.airport;
      setAirportList((list) =>
        [...list, created].sort((a, b) => a.code.localeCompare(b.code))
      );
      (addingFor === "origin" ? setOrigin : setDestination)(created.id);
      closeAddCity();
    } else {
      setCityError(result.message ?? "Something went wrong.");
    }
    setSavingCity(false);
  }

  return (
    <EntityDialog
      title={flight ? `Edit ${flight.flight_number}` : "Add flight"}
      action={saveFlight.bind(null, flight?.id ?? null)}
      trigger={
        flight
          ? <Button variant="outline" size="sm">Edit</Button>
          : <Button>Add flight</Button>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="flight_number">Flight number</Label>
          <Input id="flight_number" name="flight_number" defaultValue={flight?.flight_number} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" name="currency" defaultValue={flight?.currency ?? "USD"} maxLength={3} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="origin_airport_id">From</Label>
          <Select name="origin_airport_id" required items={airportItems}
            value={origin} onValueChange={onAirportChange("origin")}>
            <SelectTrigger id="origin_airport_id" className="h-9 w-full">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {airportItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
              <SelectItem value={ADD_NEW_CITY}>+ Add new city…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="destination_airport_id">To</Label>
          <Select name="destination_airport_id" required items={airportItems}
            value={destination} onValueChange={onAirportChange("destination")}>
            <SelectTrigger id="destination_airport_id" className="h-9 w-full">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {airportItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
              <SelectItem value={ADD_NEW_CITY}>+ Add new city…</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {addingFor && (
        <div className="grid gap-3 rounded-md border p-3">
          <p className="text-sm font-medium">
            New city ({addingFor === "origin" ? "From" : "To"})
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* No `name` attributes: these must not be submitted with the flight form */}
            <Input placeholder="Code (3 letters)" maxLength={3} value={newCity.code}
              onChange={(e) => setNewCity({ ...newCity, code: e.target.value.toUpperCase() })} />
            <Input placeholder="City" value={newCity.city}
              onChange={(e) => setNewCity({ ...newCity, city: e.target.value })} />
            <Input placeholder="Airport name" value={newCity.name}
              onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} />
            <Input placeholder="Country" value={newCity.country}
              onChange={(e) => setNewCity({ ...newCity, country: e.target.value })} />
          </div>
          {cityError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{cityError}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={addCity} disabled={savingCity}>
              {savingCity ? "Adding…" : "Add city"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={closeAddCity}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="aircraft_id">Aircraft</Label>
        <Select name="aircraft_id" required items={aircraftItems}
          value={aircraftId} onValueChange={onAircraftChange}>
          <SelectTrigger id="aircraft_id" className="h-9 w-full">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            {aircraftItems.map((a) => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="departure_at">Departure</Label>
          <Input id="departure_at" name="departure_at" type="datetime-local"
            defaultValue={flight ? toLocalInput(flight.departure_at) : ""} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="arrival_at">Arrival</Label>
          <Input id="arrival_at" name="arrival_at" type="datetime-local"
            defaultValue={flight ? toLocalInput(flight.arrival_at) : ""} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="price_economy">Economy price</Label>
          <Input id="price_economy" name="price_economy" type="number" step="0.01" min={0}
            defaultValue={flight?.price_economy} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="price_business">Business price (blank if none)</Label>
          <Input id="price_business" name="price_business" type="number" step="0.01" min={0}
            defaultValue={flight?.price_business ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="seats_total_economy">Economy seats</Label>
          <Input id="seats_total_economy" name="seats_total_economy" type="number" min={0}
            value={ecoSeats} onChange={(e) => setEcoSeats(e.target.value)} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="seats_total_business">Business seats</Label>
          <Input id="seats_total_business" name="seats_total_business" type="number" min={0}
            value={busSeats} onChange={(e) => setBusSeats(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="baggage_kg_economy">Baggage kg (economy)</Label>
          <Input id="baggage_kg_economy" name="baggage_kg_economy" type="number" min={0}
            defaultValue={flight?.baggage_kg_economy ?? 30} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="baggage_kg_business">Baggage kg (business)</Label>
          <Input id="baggage_kg_business" name="baggage_kg_business" type="number" min={0}
            defaultValue={flight?.baggage_kg_business ?? 40} required />
        </div>
      </div>
    </EntityDialog>
  );
}
