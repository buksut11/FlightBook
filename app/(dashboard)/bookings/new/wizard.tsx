"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBookingAction, checkDuplicatePending } from "./actions";
import type { FlightRow } from "@/app/(dashboard)/flights/flight-query";
import type { CabinClass, Customer, TripType, DiscountType } from "@/lib/types/database";
import type { PassengerInput } from "@/lib/validations/booking";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STEPS = ["Flight", "Customer & passengers", "Review"] as const;

const emptyPassenger: PassengerInput = {
  full_name: "", id_number: "", passenger_type: "adult",
};

const discountItems = [
  { value: "none", label: "No discount" },
  { value: "percent", label: "Percent off" },
  { value: "fixed", label: "Fixed amount off" },
];

const passengerTypeItems = [
  { value: "adult", label: "Adult" },
  { value: "child", label: "Child" },
  { value: "infant", label: "Infant" },
];

function cabinItems(f: FlightRow) {
  return [
    {
      value: "economy",
      label: `Economy — ${formatMoney(f.price_economy, f.currency)} (${f.seats_available_economy} left)`,
    },
    ...(f.price_business !== null
      ? [{
          value: "business",
          label: `Business — ${formatMoney(f.price_business, f.currency)} (${f.seats_available_business} left)`,
        }]
      : []),
  ];
}

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

  // Round trip, discount, and extra baggage state.
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [returnFlightId, setReturnFlightId] = useState<string | null>(null);
  const [returnCabin, setReturnCabin] = useState<CabinClass>("economy");
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [extraBaggageKg, setExtraBaggageKg] = useState("0");
  const [extraBaggageFee, setExtraBaggageFee] = useState("0");

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

  const returnFlight = useMemo(
    () => flights.find((f) => f.id === returnFlightId) ?? null,
    [flights, returnFlightId]
  );
  const returnEligible = useMemo(
    () => flight ? flights.filter((f) => f.id !== flight.id && new Date(f.departure_at) > new Date(flight.departure_at)) : [],
    [flights, flight]
  );
  const returnUnitPrice = returnFlight
    ? returnCabin === "economy" ? returnFlight.price_economy : (returnFlight.price_business ?? 0)
    : 0;
  const returnSubtotal = tripType === "round_trip" && returnFlight ? returnUnitPrice * passengers.length : 0;
  const combinedSubtotal = subtotal + returnSubtotal;
  const discountAmount =
    discountType === "percent" ? Math.min(combinedSubtotal, (combinedSubtotal * Number(discountValue || 0)) / 100)
    : discountType === "fixed" ? Math.min(combinedSubtotal, Number(discountValue || 0))
    : 0;
  const grandTotal = combinedSubtotal - discountAmount + Number(extraBaggageFee || 0);

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
        customer: { id: customerId, full_name: name.trim(), phone: phone.trim(), email: email.trim() },
        passengers,
        return_flight_id: tripType === "round_trip" ? returnFlightId! : undefined,
        return_cabin_class: tripType === "round_trip" ? returnCabin : undefined,
        discount_type: discountType,
        discount_value: Number(discountValue || 0),
        discount_reason: discountReason || undefined,
        extra_baggage_kg: Number(extraBaggageKg || 0),
        extra_baggage_fee: Number(extraBaggageFee || 0),
      });
      if (result.ok) {
        const qs = result.returnReference
          ? `ref=${result.reference}&return=${result.returnReference}`
          : `ref=${result.reference}`;
        router.push(`/bookings/new/success?${qs}`);
      } else {
        setError(result.message);
      }
    });
  }

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

          <div className="flex gap-2">
            <Button type="button" variant={tripType === "one_way" ? "default" : "outline"} size="sm"
              onClick={() => { setTripType("one_way"); setReturnFlightId(null); }}>
              One way
            </Button>
            <Button type="button" variant={tripType === "round_trip" ? "default" : "outline"} size="sm"
              onClick={() => setTripType("round_trip")}>
              Round trip
            </Button>
          </div>

          {tripType === "round_trip" && flight && (
            <p className="text-xs text-muted-foreground">Outbound selected — now choose a later return flight below.</p>
          )}

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

          {tripType === "round_trip" && flight && (
            <div className="grid gap-2 border-t pt-3">
              <Label>Return flight</Label>
              {returnEligible.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No later flights available for a return leg.
                </p>
              )}
              {returnEligible.map((f) => (
                <Card key={f.id}
                  className={cn("cursor-pointer", returnFlightId === f.id && "border-primary")}
                  onClick={() => setReturnFlightId(f.id)}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                    <div>
                      <p className="font-medium">{f.flight_number} · {f.origin?.code} → {f.destination?.code}</p>
                      <p className="text-muted-foreground">{formatDateTime(f.departure_at)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Economy: {f.seats_available_economy} left
                      {f.price_business !== null && ` · Business: ${f.seats_available_business} left`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={!flightId || (tripType === "round_trip" && !returnFlightId)} onClick={() => setStep(1)}>
              Continue
            </Button>
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
            <Label>Cabin class{tripType === "round_trip" ? " (outbound)" : ""}</Label>
            <Select items={cabinItems(flight)} value={cabin}
              onValueChange={(v: string | null) => setCabin((v ?? "economy") as CabinClass)}>
              <SelectTrigger className="h-9 w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cabinItems(flight).map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tripType === "round_trip" && returnFlight && (
            <div className="grid gap-2">
              <Label>Return cabin class</Label>
              <Select items={cabinItems(returnFlight)} value={returnCabin}
                onValueChange={(v: string | null) => setReturnCabin((v ?? "economy") as CabinClass)}>
                <SelectTrigger className="h-9 w-full sm:w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cabinItems(returnFlight).map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2 border-t pt-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Discount</Label>
              <Select items={discountItems} value={discountType}
                onValueChange={(v: string | null) => setDiscountType((v ?? "none") as DiscountType)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {discountItems.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {discountType !== "none" && (
              <>
                <div className="grid gap-2">
                  <Label>{discountType === "percent" ? "Percent" : "Amount"}</Label>
                  <Input type="number" min="0" step="0.01" value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Reason</Label>
                  <Input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="e.g. group booking" />
                </div>
              </>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Extra baggage (kg)</Label>
              <Input type="number" min="0" value={extraBaggageKg}
                onChange={(e) => setExtraBaggageKg(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Extra baggage fee</Label>
              <Input type="number" min="0" step="0.01" value={extraBaggageFee}
                onChange={(e) => setExtraBaggageFee(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Passengers ({passengers.length})</Label>
            {passengers.map((p, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Input placeholder="Full name" value={p.full_name}
                  onChange={(e) => setPassenger(i, { full_name: e.target.value })} />
                <Input placeholder="ID / passport (optional)" value={p.id_number ?? ""}
                  onChange={(e) => setPassenger(i, { id_number: e.target.value })} />
                <Select items={passengerTypeItems} value={p.passenger_type}
                  onValueChange={(v: string | null) =>
                    setPassenger(i, { passenger_type: (v ?? "adult") as PassengerInput["passenger_type"] })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {passengerTypeItems.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

          <p className="text-sm font-medium">
            Total{tripType === "round_trip" ? " (both legs)" : ""}: {formatMoney(grandTotal, flight.currency)}
          </p>

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
                Outbound: {flight.flight_number} · {flight.origin?.code} → {flight.destination?.code} · {formatDateTime(flight.departure_at)}
              </p>
              {tripType === "round_trip" && returnFlight && (
                <p className="font-medium">
                  Return: {returnFlight.flight_number} · {returnFlight.origin?.code} → {returnFlight.destination?.code} · {formatDateTime(returnFlight.departure_at)}
                </p>
              )}
              <p>Customer: {name} ({phone})</p>
              <p className="capitalize">Passengers: {passengers.length}</p>
              <ul className="list-inside list-disc text-muted-foreground">
                {passengers.map((p, i) => (
                  <li key={i}>{p.full_name}{p.id_number ? ` — ${p.id_number}` : ""} ({p.passenger_type})</li>
                ))}
              </ul>
              <div className="mt-2 grid gap-0.5">
                <p>Subtotal: {formatMoney(combinedSubtotal, flight.currency)}</p>
                {discountAmount > 0 && <p>Discount: −{formatMoney(discountAmount, flight.currency)}</p>}
                {Number(extraBaggageFee) > 0 && <p>Extra baggage: +{formatMoney(Number(extraBaggageFee), flight.currency)}</p>}
                <p className="text-base font-semibold">Total: {formatMoney(grandTotal, flight.currency)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                The booking is created as PENDING. Record the payment from the outbound booking&apos;s page to confirm{tripType === "round_trip" ? " both legs" : " it"}.
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
