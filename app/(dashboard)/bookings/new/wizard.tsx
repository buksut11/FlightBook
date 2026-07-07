"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createBookingAction, checkDuplicatePending } from "./actions";
import type { FlightRow } from "@/app/(dashboard)/flights/flight-query";
import type { CabinClass, Customer, PassengerType, TripType, DiscountType } from "@/lib/types/database";
import type { PassengerInput } from "@/lib/validations/booking";
import { fareFor, legSubtotal } from "@/lib/pricing";
import { rpcErrorText } from "@/lib/rpc-errors";
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

const PASSENGER_TYPES: PassengerType[] = ["adult", "child", "infant"];

const TYPE_LABELS: Record<PassengerType, string> = {
  adult: "Adult", child: "Child", infant: "Infant",
};

function cabinFareLabel(f: FlightRow, cabin: CabinClass): string {
  return PASSENGER_TYPES
    .map((t) => `${formatMoney(fareFor(f, cabin, t), f.currency)} ${t}`)
    .join(" / ");
}

function cabinItems(f: FlightRow) {
  return [
    {
      value: "economy",
      label: `Economy — ${cabinFareLabel(f, "economy")} (${f.seats_available_economy} left)`,
    },
    ...(f.price_business !== null
      ? [{
          value: "business",
          label: `Business — ${cabinFareLabel(f, "business")} (${f.seats_available_business} left)`,
        }]
      : []),
  ];
}

// True when the flight has no dedicated child/infant fare for this cabin,
// meaning those passengers are charged the adult fare.
function usesAdultFallback(f: FlightRow, cabin: CabinClass): boolean {
  return cabin === "economy"
    ? f.price_economy_child === null || f.price_economy_infant === null
    : f.price_business_child === null || f.price_business_infant === null;
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
  const [prevBalance, setPrevBalance] = useState(0);
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
  // Only passengers with a name entered count toward the price, so the blank
  // starter row doesn't show a total before anyone has been added.
  const pricedPassengers = passengers.filter((p) => p.full_name.trim().length > 0);
  const subtotal = flight ? legSubtotal(flight, cabin, pricedPassengers) : 0;

  const returnFlight = useMemo(
    () => flights.find((f) => f.id === returnFlightId) ?? null,
    [flights, returnFlightId]
  );
  const returnEligible = useMemo(
    () => flight ? flights.filter((f) => f.id !== flight.id && new Date(f.departure_at) > new Date(flight.departure_at)) : [],
    [flights, flight]
  );
  const returnSubtotal =
    tripType === "round_trip" && returnFlight ? legSubtotal(returnFlight, returnCabin, pricedPassengers) : 0;
  const combinedSubtotal = subtotal + returnSubtotal;
  const discountAmount =
    discountType === "percent" ? Math.min(combinedSubtotal, (combinedSubtotal * Number(discountValue || 0)) / 100)
    : discountType === "fixed" ? Math.min(combinedSubtotal, Number(discountValue || 0))
    : 0;
  const grandTotal = combinedSubtotal - discountAmount + Number(extraBaggageFee || 0);
  // Server-side, create_booking rolls the customer's previous unpaid balance
  // into the new total; mirror that here so the agent sees the real amount due.
  const totalDue = grandTotal + prevBalance;

  // Per-type fare lines for both legs combined, e.g. "2 × Adult — $240".
  const fareBreakdown = PASSENGER_TYPES.map((t) => {
    const count = pricedPassengers.filter((p) => p.passenger_type === t).length;
    if (count === 0 || !flight) return null;
    const each =
      fareFor(flight, cabin, t) +
      (tripType === "round_trip" && returnFlight ? fareFor(returnFlight, returnCabin, t) : 0);
    return { type: t, count, amount: each * count };
  }).filter((x): x is { type: PassengerType; count: number; amount: number } => x !== null);

  // Passenger type choices priced per seat for the selected cabin(s),
  // e.g. "Child — $110.00" (both legs combined on round trips).
  const passengerTypeItems = PASSENGER_TYPES.map((t) => ({
    value: t,
    label: flight
      ? `${TYPE_LABELS[t]} — ${formatMoney(
          fareFor(flight, cabin, t) +
            (tripType === "round_trip" && returnFlight ? fareFor(returnFlight, returnCabin, t) : 0),
          flight.currency
        )}`
      : TYPE_LABELS[t],
  }));

  const filteredFlights = flights.filter((f) => {
    const s = `${f.flight_number} ${f.origin?.code} ${f.origin?.city} ${f.destination?.code} ${f.destination?.city}`.toLowerCase();
    return s.includes(flightFilter.toLowerCase());
  });

  async function lookupCustomer(p: string) {
    setPhone(p);
    setCustomerId(undefined);
    setPrevBalance(0);
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
      const { data: bal, error: balError } = await supabase
        .from("customer_balances")
        .select("outstanding")
        .eq("customer_id", c.id)
        .maybeSingle();
      if (balError) {
        // Don't silently under-charge: the previous balance couldn't be read.
        setError(
          `Couldn't check this customer's previous unpaid balance — ${rpcErrorText(balError, "customer balances")}`
        );
      } else {
        setPrevBalance(Math.max(0, Number(bal?.outstanding ?? 0)));
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
              role="radio"
              aria-checked={flightId === f.id}
              className={cn(
                "cursor-pointer transition-shadow",
                flightId === f.id
                  ? "bg-primary/5 ring-2 ring-primary"
                  : "hover:ring-foreground/25"
              )}
              onClick={() => {
                setFlightId(f.id);
                // Keep dependent choices valid when the flight changes mid-wizard.
                if (f.price_business === null) setCabin("economy");
                if (returnFlight && new Date(returnFlight.departure_at) <= new Date(f.departure_at)) {
                  setReturnFlightId(null);
                }
              }}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div>
                  <p className="flex items-center gap-1.5 font-medium">
                    {flightId === f.id && <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />}
                    {f.flight_number} · {f.origin?.code} → {f.destination?.code}
                    {flightId === f.id && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                        Selected
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">{formatDateTime(f.departure_at)}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>
                    Economy: {f.seats_available_economy} left · {formatMoney(f.price_economy, f.currency)} adult
                    {f.price_economy_child !== null && ` · ${formatMoney(f.price_economy_child, f.currency)} child`}
                    {f.price_economy_infant !== null && ` · ${formatMoney(f.price_economy_infant, f.currency)} infant`}
                  </p>
                  {f.price_business !== null && (
                    <p>
                      Business: {f.seats_available_business} left · {formatMoney(f.price_business, f.currency)} adult
                      {f.price_business_child !== null && ` · ${formatMoney(f.price_business_child, f.currency)} child`}
                      {f.price_business_infant !== null && ` · ${formatMoney(f.price_business_infant, f.currency)} infant`}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {flights.length === 0 && (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">No upcoming flights to book.</p>
              <p className="mt-1">
                There are no scheduled flights in the future with seats available.
                An admin can add flights on the{" "}
                <Link href="/flights" className="text-primary underline">Flights page</Link>
                {" "}— a flight must have a future departure time and a status of
                &quot;scheduled&quot; to appear here.
              </p>
            </div>
          )}
          {flights.length > 0 && filteredFlights.length === 0 && (
            <p className="text-sm text-muted-foreground">No flights match your search.</p>
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
                  role="radio"
                  aria-checked={returnFlightId === f.id}
                  className={cn(
                    "cursor-pointer transition-shadow",
                    returnFlightId === f.id
                      ? "bg-primary/5 ring-2 ring-primary"
                      : "hover:ring-foreground/25"
                  )}
                  onClick={() => {
                    setReturnFlightId(f.id);
                    if (f.price_business === null) setReturnCabin("economy");
                  }}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                    <div>
                      <p className="flex items-center gap-1.5 font-medium">
                        {returnFlightId === f.id && <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden />}
                        {f.flight_number} · {f.origin?.code} → {f.destination?.code}
                        {returnFlightId === f.id && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                            Selected
                          </span>
                        )}
                      </p>
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
          <Card className="bg-muted/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div className="grid gap-0.5">
                <p className="font-medium">
                  {tripType === "round_trip" ? "Outbound: " : "Flight: "}
                  {flight.flight_number} · {flight.origin?.code} → {flight.destination?.code} · {formatDateTime(flight.departure_at)}
                </p>
                {tripType === "round_trip" && returnFlight && (
                  <p className="font-medium">
                    Return: {returnFlight.flight_number} · {returnFlight.origin?.code} → {returnFlight.destination?.code} · {formatDateTime(returnFlight.departure_at)}
                  </p>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setStep(0)}>
                Change flight
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="phone">Customer phone</Label>
              <Input id="phone" value={phone} onChange={(e) => lookupCustomer(e.target.value)}
                placeholder="09xxxxxxxx" />
              {customerId && (
                <p className="text-xs text-green-600">Existing customer found — details filled.</p>
              )}
              {customerId && prevBalance > 0 && flight && (
                <p className="text-xs text-amber-600">
                  Unpaid balance of {formatMoney(prevBalance, flight.currency)} from previous
                  bookings — it will be added to this booking&apos;s total due.
                </p>
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
            {usesAdultFallback(flight, cabin) && (
              <p className="text-xs text-muted-foreground">
                This flight has no separate child/infant fare for {cabin} — those passengers
                are charged the adult fare. An admin can set child and infant prices when
                editing the flight on the <Link href="/flights" className="text-primary underline">Flights page</Link>.
              </p>
            )}
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
              {usesAdultFallback(returnFlight, returnCabin) && (
                <p className="text-xs text-muted-foreground">
                  This flight has no separate child/infant fare for {returnCabin} — those
                  passengers are charged the adult fare.
                </p>
              )}
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

          {pricedPassengers.length > 0 ? (
            <div className="text-sm font-medium">
              {fareBreakdown.map((fb) => (
                <p key={fb.type} className="text-xs font-normal capitalize text-muted-foreground">
                  {fb.count} × {fb.type}: {formatMoney(fb.amount, flight.currency)}
                </p>
              ))}
              <p>
                Total{tripType === "round_trip" ? " (both legs)" : ""}: {formatMoney(grandTotal, flight.currency)}
              </p>
              {prevBalance > 0 && (
                <p className="text-amber-600">
                  Total due incl. previous balance: {formatMoney(totalDue, flight.currency)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enter a passenger name to see the total.
            </p>
          )}

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
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-1">
                  <p className="font-medium">
                    Outbound: {flight.flight_number} · {flight.origin?.code} → {flight.destination?.code} · {formatDateTime(flight.departure_at)}
                    <span className="capitalize text-muted-foreground"> · {cabin}</span>
                  </p>
                  {tripType === "round_trip" && returnFlight && (
                    <p className="font-medium">
                      Return: {returnFlight.flight_number} · {returnFlight.origin?.code} → {returnFlight.destination?.code} · {formatDateTime(returnFlight.departure_at)}
                      <span className="capitalize text-muted-foreground"> · {returnCabin}</span>
                    </p>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(0)}>
                  Change flight
                </Button>
              </div>
              <p>Customer: {name} ({phone})</p>
              <p className="capitalize">Passengers: {passengers.length}</p>
              <ul className="list-inside list-disc text-muted-foreground">
                {passengers.map((p, i) => (
                  <li key={i}>{p.full_name}{p.id_number ? ` — ${p.id_number}` : ""} ({p.passenger_type})</li>
                ))}
              </ul>
              <div className="mt-2 grid gap-0.5">
                {fareBreakdown.map((fb) => (
                  <p key={fb.type} className="capitalize text-muted-foreground">
                    {fb.count} × {fb.type}: {formatMoney(fb.amount, flight.currency)}
                  </p>
                ))}
                <p>Subtotal: {formatMoney(combinedSubtotal, flight.currency)}</p>
                {discountAmount > 0 && <p>Discount: −{formatMoney(discountAmount, flight.currency)}</p>}
                {Number(extraBaggageFee) > 0 && <p>Extra baggage: +{formatMoney(Number(extraBaggageFee), flight.currency)}</p>}
                {prevBalance > 0 && (
                  <p className="text-amber-600">
                    Previous unpaid balance: +{formatMoney(prevBalance, flight.currency)}
                  </p>
                )}
                <p className="text-base font-semibold">
                  Total due: {formatMoney(totalDue, flight.currency)}
                </p>
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
