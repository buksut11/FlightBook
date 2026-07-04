"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBookingAction, checkDuplicatePending } from "./actions";
import type { FlightRow } from "@/app/(dashboard)/flights/flight-query";
import type { CabinClass, Customer } from "@/lib/types/database";
import type { PassengerInput } from "@/lib/validations/booking";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STEPS = ["Flight", "Customer & passengers", "Review"] as const;

const emptyPassenger: PassengerInput = {
  full_name: "", id_number: "", passenger_type: "adult",
};

export function Wizard({ flights }: { flights: FlightRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [flightId, setFlightId] = useState<string | null>(null);
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [passengers, setPassengers] = useState<PassengerInput[]>([{ ...emptyPassenger }]);
  const [flightFilter, setFlightFilter] = useState("");
  const [duplicateRef, setDuplicateRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flight = useMemo(
    () => flights.find((f) => f.id === flightId) ?? null,
    [flights, flightId]
  );
  const seatsLeft = flight
    ? cabin === "economy" ? flight.seats_available_economy : flight.seats_available_business
    : 0;
  const unitPrice = flight
    ? cabin === "economy" ? flight.price_economy : (flight.price_business ?? 0)
    : 0;
  const subtotal = unitPrice * passengers.length;

  const filteredFlights = flights.filter((f) => {
    const s = `${f.flight_number} ${f.origin?.code} ${f.origin?.city} ${f.destination?.code} ${f.destination?.city}`.toLowerCase();
    return s.includes(flightFilter.toLowerCase());
  });

  async function lookupCustomer(p: string) {
    setPhone(p);
    setCustomerId(undefined);
    if (p.trim().length < 6) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("customers").select("*").eq("phone", p.trim()).limit(1);
    if (data && data.length > 0) {
      const c = data[0] as Customer;
      setCustomerId(c.id);
      setName(c.full_name);
      setEmail(c.email ?? "");
      if (passengers.length === 1 && passengers[0].full_name === "") {
        setPassengers([{ ...emptyPassenger, full_name: c.full_name }]);
      }
    }
  }

  function setPassenger(i: number, patch: Partial<PassengerInput>) {
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function goToReview() {
    setError(null);
    if (!name.trim() || phone.trim().length < 6) {
      setError("Customer name and a valid phone are required.");
      return;
    }
    if (passengers.some((p) => p.full_name.trim().length < 2)) {
      setError("Every passenger needs a name.");
      return;
    }
    if (passengers.length > seatsLeft) {
      setError(`Only ${seatsLeft} seat(s) left in ${cabin} on ${flight!.flight_number}.`);
      return;
    }
    const dup = await checkDuplicatePending(phone.trim(), flightId!);
    setDuplicateRef(dup?.reference ?? null);
    setStep(2);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBookingAction({
        flight_id: flightId!,
        cabin_class: cabin,
        customer: {
          id: customerId,
          full_name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
        },
        passengers,
      });
      if (result.ok) {
        router.push(`/bookings/new/success?ref=${result.reference}`);
      } else {
        setError(result.message);
      }
    });
  }

  const selectCls = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div className="mt-4 grid gap-4">
      <ol className="flex gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={cn(
            "rounded-full px-3 py-1",
            i === step ? "bg-primary text-primary-foreground"
              : i < step ? "bg-muted text-foreground" : "bg-muted text-muted-foreground"
          )}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-md border border-red-600 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* STEP 0: flight */}
      {step === 0 && (
        <div className="grid gap-3">
          <Input placeholder="Filter by flight number or city…" value={flightFilter}
            onChange={(e) => setFlightFilter(e.target.value)} />
          {filteredFlights.map((f) => (
            <Card key={f.id}
              className={cn("cursor-pointer", flightId === f.id && "border-primary")}
              onClick={() => setFlightId(f.id)}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div>
                  <p className="font-medium">
                    {f.flight_number} · {f.origin?.code} → {f.destination?.code}
                  </p>
                  <p className="text-muted-foreground">{formatDateTime(f.departure_at)}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Economy: {f.seats_available_economy} left · {formatMoney(f.price_economy, f.currency)}</p>
                  {f.price_business !== null && (
                    <p>Business: {f.seats_available_business} left · {formatMoney(f.price_business, f.currency)}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredFlights.length === 0 && (
            <p className="text-sm text-muted-foreground">No bookable flights match.</p>
          )}
          <div className="flex justify-end">
            <Button disabled={!flightId} onClick={() => setStep(1)}>Continue</Button>
          </div>
        </div>
      )}

      {/* STEP 1: customer + passengers + class */}
      {step === 1 && flight && (
        <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="phone">Customer phone</Label>
              <Input id="phone" value={phone} onChange={(e) => lookupCustomer(e.target.value)}
                placeholder="09xxxxxxxx" />
              {customerId && (
                <p className="text-xs text-green-600">Existing customer found — details filled.</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Customer name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Cabin class</Label>
            <select className={selectCls} value={cabin}
              onChange={(e) => setCabin(e.target.value as CabinClass)}>
              <option value="economy">
                Economy — {formatMoney(flight.price_economy, flight.currency)} ({flight.seats_available_economy} left)
              </option>
              {flight.price_business !== null && (
                <option value="business">
                  Business — {formatMoney(flight.price_business, flight.currency)} ({flight.seats_available_business} left)
                </option>
              )}
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Passengers ({passengers.length})</Label>
            {passengers.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Input placeholder="Full name" value={p.full_name}
                  onChange={(e) => setPassenger(i, { full_name: e.target.value })} />
                <Input placeholder="ID / passport (optional)" value={p.id_number ?? ""}
                  onChange={(e) => setPassenger(i, { id_number: e.target.value })} />
                <select className={selectCls} value={p.passenger_type}
                  onChange={(e) => setPassenger(i, { passenger_type: e.target.value as PassengerInput["passenger_type"] })}>
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                  <option value="infant">Infant</option>
                </select>
                <Button variant="ghost" size="sm" disabled={passengers.length === 1}
                  onClick={() => setPassengers((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={passengers.length >= 9}
              onClick={() => setPassengers((prev) => [...prev, { ...emptyPassenger }])}>
              Add passenger
            </Button>
          </div>

          <p className="text-sm font-medium">Total: {formatMoney(subtotal, flight.currency)}</p>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={goToReview}>Review</Button>
          </div>
        </div>
      )}

      {/* STEP 2: review + create */}
      {step === 2 && flight && (
        <div className="grid gap-4">
          {duplicateRef && (
            <p className="rounded-md border border-amber-600 p-3 text-sm text-amber-600">
              This phone number already has a pending booking on this flight ({duplicateRef}).
              You can still continue if this is intentional.
            </p>
          )}
          <Card>
            <CardContent className="grid gap-1 p-4 text-sm">
              <p className="font-medium">
                {flight.flight_number} · {flight.origin?.code} → {flight.destination?.code} · {formatDateTime(flight.departure_at)}
              </p>
              <p>Customer: {name} ({phone})</p>
              <p className="capitalize">Class: {cabin} · Passengers: {passengers.length}</p>
              <ul className="list-inside list-disc text-muted-foreground">
                {passengers.map((p, i) => (
                  <li key={i}>
                    {p.full_name}{p.id_number ? ` — ${p.id_number}` : ""} ({p.passenger_type})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-base font-semibold">
                Total: {formatMoney(subtotal, flight.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                The booking is created as PENDING. Record the payment from the booking page to confirm it.
              </p>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create booking"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
