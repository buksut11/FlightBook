# CargoBook — Product Specification

**Version 1.0 · Air-cargo management module for FlightBook**

CargoBook turns FlightBook into a combined passenger + cargo operations system. Staff can
quote, book, accept, load, track, and bill air freight on the same flights the airline
already operates — with the same login, the same staff accounts, and the same look and feel.

This document is the **source of truth**. The nine plans in `docs/cargo/plans/` describe the
build order; when a plan and this spec disagree, this spec wins.

---

## 1. Vision & design bar

The goal is a system that feels like a modern flagship SaaS product, not an internal tool:

- **Fast to operate.** A trained agent can quote a shipment in under 30 seconds and book one
  in under 2 minutes. Every list screen has search-as-you-type and keyboard-friendly forms.
- **Impossible to get wrong.** The UI prevents mistakes instead of reporting them: you cannot
  overload a flight, book a cancelled flight, or accept more pieces than were booked.
  Chargeable weight, totals, and balances are always computed by the database — never typed in.
- **Beautiful by default.** Reuses FlightBook's design system (sky-blue primary `#0284c7`,
  slate neutrals, shadcn/ui components, light + dark themes). Every screen has a designed
  empty state, loading skeletons, and toast feedback (sonner). Status is always shown as a
  colored badge, never plain text.
- **Trustworthy.** Every shipment has a complete, timestamped event history showing who did
  what. Money amounts are computed server-side and immutable once invoiced.

## 2. Technology (fixed — do not change)

Identical to the existing app: **Next.js 15 App Router (TypeScript strict) · Supabase
(Postgres + Auth + RLS) · Tailwind CSS 4 · shadcn/ui · react-hook-form + Zod ·
@react-pdf/renderer · Vitest**. New tables follow the conventions of the existing migrations
(`supabase/migrations/000X_*.sql`, RLS on every table, `is_admin()` / `is_active_staff()`
helpers). New screens live in `app/(dashboard)/cargo/…` except the public tracking page.

## 3. Users & permissions

Reuses the existing `profiles` table and roles. No new auth system.

| Role | Can do |
| --- | --- |
| **Agent** | Everything operational: quotes, shipments, acceptance, manifesting, payments, tracking, customers. |
| **Admin** | Everything agents can, plus: rate cards, commodity/surcharge settings, voiding invoices, cargo reports, cancelling manifested shipments. |
| **Public (no login)** | One page only: track a shipment by AWB number. Read-only, no prices shown. |

## 4. Glossary (plain-language)

- **AWB (Air Waybill):** the cargo equivalent of a ticket — the contract and ID for one
  shipment. Format: `XXX-NNNNNNNC` (3-digit airline prefix, 7-digit serial, 1 check digit).
- **Shipper / Consignee:** who sends the cargo / who receives it.
- **Piece:** one physical box/pallet. A shipment has one or more pieces.
- **Gross weight:** what the scale says, in kg.
- **Volumetric weight:** `(length × width × height in cm) ÷ 6000` per piece — the IATA
  standard, so bulky-but-light cargo pays fairly.
- **Chargeable weight:** `max(gross, volumetric)`, rounded **up** to the next 0.5 kg. This is
  what the customer pays for.
- **Manifest:** the official list of all cargo loaded on one flight.
- **Commodity:** what the goods are (electronics, perishables, documents…), used for
  handling rules and rating.

## 5. Shipment lifecycle (the heart of the system)

```
DRAFT → BOOKED → ACCEPTED → MANIFESTED → DEPARTED → ARRIVED → DELIVERED
                    (any state before DEPARTED can go to → CANCELLED)
```

| Status | Meaning | Who sets it |
| --- | --- | --- |
| `draft` | Quote saved, not confirmed. Holds no capacity. | Agent (wizard step) |
| `booked` | Confirmed with the customer. AWB number issued. Reserves flight capacity if a flight was chosen. | Agent |
| `accepted` | Cargo physically received at warehouse; real weights/dims verified and re-rated. | Agent (acceptance screen) |
| `manifested` | Locked onto a specific flight's manifest. | Agent |
| `departed` | Flight left. Set for all manifested shipments in one click. | Agent |
| `arrived` | Reached destination airport. | Agent |
| `delivered` | Handed to consignee (name of receiver recorded). | Agent |
| `cancelled` | Cancelled with reason. Releases capacity. After `manifested`, only admins can cancel. | Agent / Admin |

Rules:
- Transitions only move forward (plus cancel). Enforced in the database, not just the UI.
- Every transition writes a row to `cargo_events` (timestamp, staff member, optional note) —
  this powers tracking.
- A shipment cannot be `manifested` unless payment terms allow it: prepaid shipments must be
  fully paid; collect shipments may fly unpaid (paid on arrival).

## 6. Modules & screens

### 6.1 Cargo customers (`/cargo/customers`)

Companies and individuals who ship or receive. Separate from passenger customers.

- Fields: type (company/individual), name, contact person, phone, email, address, city,
  country, tax/ID number, internal notes.
- List with instant search (name/phone/email), detail page showing full shipment history and
  lifetime totals (shipments, kg, revenue).
- Any customer can act as shipper on one shipment and consignee on another — no separate lists.
- Created inline from the booking wizard (dialog) as well as from the customers screen.

### 6.2 Settings (admin only, added to existing `/settings`)

- **Commodities:** code + name + flags: `is_dangerous` (blocked from booking, shown with a
  warning), `requires_cold_chain`, `is_valuable`. Seed ~10 sensible defaults (GEN General,
  PER Perishables, DOC Documents, ELE Electronics, PHA Pharma, …).
- **Cargo settings:** airline AWB prefix (3 digits), volumetric divisor (default 6000),
  currency (reuse app default), fuel surcharge %, security surcharge % (both applied to the
  freight charge), default per-shipment fixed fees (e.g. AWB fee).
- **Rate cards:** see 6.3.

### 6.3 Rates & quoting (`/cargo/quote` + settings)

- A **rate card** = origin airport + destination airport + commodity (or "any") + valid-from
  date, with **weight-break pricing**: minimum charge, then per-kg price at breaks
  `≥1 / ≥45 / ≥100 / ≥300 / ≥500 kg` (editable). The applicable price is the cheapest of
  "your break price × chargeable weight" and "next break price × next break minimum"
  (standard air-cargo under-pricing), never below the minimum charge.
- Rating picks the most specific active card (exact commodity beats "any"; latest
  valid-from wins). If no card exists, the quote screen says so and the shipment cannot be
  priced (agent may enter a manual freight charge, flagged as `manual_rate`).
- **Quote calculator:** pick route, commodity, enter pieces (count, dims, weight) → instant
  breakdown: gross, volumetric, chargeable weight, freight, surcharges, fees, total. Quotes
  can be saved as `draft` shipments or discarded. Charge math lives in
  `lib/cargo/rating.ts` with thorough Vitest coverage.

### 6.4 Shipment booking wizard (`/cargo/shipments/new`)

Four steps, mirroring the existing passenger booking wizard's UX:

1. **Route & flight:** origin/destination airports; optionally pick a specific upcoming
   flight (shows remaining cargo capacity per flight); or "no flight yet" (assign later).
2. **Parties:** shipper and consignee — search existing customers or create inline.
3. **Cargo:** commodity, description, declared value, special-handling flags, and a pieces
   table (rows of count × dims × weight) with live chargeable-weight totals.
4. **Charges & confirm:** rated breakdown (or manual rate if permitted), payment terms
   (**prepaid** or **collect**), review, then **Book** → issues the AWB number and shows a
   success page with the AWB, a link to the shipment, and a "print AWB" button.

AWB numbers: `prefix-serialC` where serial is a Postgres sequence padded to 7 digits and
`C = serial mod 7` (IATA check digit). Issued atomically by a database function at booking.

### 6.5 Shipments list & detail (`/cargo/shipments`, `/cargo/shipments/[id]`)

- List: filter by status, route, flight, date range; search by AWB, shipper, consignee.
  Columns: AWB, route, shipper → consignee, pieces/kg (chargeable), flight, status badge,
  payment badge (`unpaid` / `partial` / `paid`), total.
- Detail: everything about one shipment — parties, pieces, charges breakdown, payment
  status, flight, event timeline, actions appropriate to its status (accept, manifest,
  record payment, cancel, print documents). This is the screen agents live in.

### 6.6 Flight capacity & manifests (`/cargo/flights`, `/cargo/flights/[id]`)

- `aircraft` gains `cargo_capacity_kg` and `cargo_capacity_m3` (admin-editable; default 0 =
  no cargo). Flights inherit capacity from their aircraft.
- Flight cargo page: capacity bars (kg and m³, like the existing passenger load bar), list
  of manifested + booked-to-this-flight shipments, and an "add shipments" picker showing
  compatible `accepted` shipments (same route, fits remaining capacity).
- Manifesting is transactional: the database rejects any assignment that would exceed
  remaining capacity in kg **or** volume.
- One click: **Depart flight** (all manifested → `departed`) and **Arrive flight**
  (all departed → `arrived`), each with a confirmation dialog.

### 6.7 Warehouse acceptance (part of shipment detail)

For a `booked` shipment: an acceptance form to confirm/correct actual pieces, weights, and
dims (pre-filled from booking). On save: shipment becomes `accepted`, is **re-rated** from
verified figures, and the event log records both the old and new figures if they changed.

### 6.8 Tracking

- **Internal:** vertical timeline on the shipment detail (event, time, staff, note).
- **Public (`/track`):** no login. Enter an AWB number → status, route, piece count, and the
  milestone timeline (no names, no prices, no addresses). Invalid AWB → friendly "not found".
  Served by a `SECURITY DEFINER` Postgres function that exposes only these safe fields;
  the anonymous role has no direct table access.

### 6.9 Documents (PDF, matching the existing ticket PDF's visual style)

- **Air Waybill:** professional AWB layout — parties, routing, pieces, weights, charges,
  terms — printable from the shipment detail. Includes the AWB number as a Code-128-style
  barcode (implemented by embedding a small barcode-drawing helper, no new heavy deps).
- **Piece labels:** one label per piece (AWB barcode, piece X of Y, route, weight), sized
  A6, printed as one multi-page PDF.
- **Cargo manifest:** per-flight PDF listing all manifested shipments with totals, for the
  crew/handling agent. Printable from the flight cargo page.

### 6.10 Payments & invoicing

- Reuses the pattern of the existing booking payments: record payments (cash / card /
  transfer) against a shipment, with server-computed balance; overpayment blocked.
- Payment badge on every shipment; prepaid shipments cannot be manifested until balance = 0.
- **Invoice:** generated per shipment (or on demand), printable PDF with a sequential
  invoice number, itemized charges, payments received, and balance. Once an invoice exists,
  the shipment's charges are frozen (admin can void + reissue with a reason).

### 6.11 Dashboard & reports

- Dashboard (existing home page gains a cargo section): today's shipments booked, kg
  awaiting acceptance, shipments flying today, unpaid balance total, and a "needs attention"
  list (accepted but unmanifested shipments whose chosen flight departs within 24 h).
- Reports (`/reports`, cargo tab, admin only): date-range revenue, tonnage, shipment counts
  by status, top 10 customers, top routes; CSV export mirroring the existing export route.

## 7. Data model (tables the plans will create)

| Table | Purpose / key columns |
| --- | --- |
| `cargo_customers` | Shippers & consignees (6.1 fields). |
| `commodities` | Code, name, handling flags. |
| `cargo_settings` | Single-row: AWB prefix, divisor, surcharge %, fees. |
| `rate_cards` + `rate_breaks` | Route/commodity pricing with weight breaks. |
| `shipments` | AWB number (unique), shipper/consignee FKs, route, optional flight FK, commodity, status, payment terms, declared value, totals (gross/volumetric/chargeable kg, m³), charge fields (freight, surcharges, fees, total), `manual_rate` flag, timestamps. |
| `shipment_pieces` | Per-piece count, dims (cm), weight; booked vs verified values. |
| `cargo_events` | Shipment FK, event type, staff FK, note, `created_at`. |
| `cargo_payments` | Shipment FK, amount, method, staff FK, note. |
| `cargo_invoices` | Sequential number, shipment FK, frozen line items (jsonb), status (`issued`/`void`), void reason. |

All tables: RLS enabled; staff read/write via `is_active_staff()`; settings/rates writable
via `is_admin()`; the public tracking function is the only anonymous surface. Status
transitions, AWB issuance, manifesting (capacity check), payment recording, and invoice
freezing are Postgres functions so the rules hold even if the UI misbehaves.

## 8. Quality bar (applies to every plan)

- `npm run lint`, `npm test`, and `npm run build` pass after every plan.
- All money/weight math has unit tests, including rounding and weight-break edge cases.
- Zod validation on every form (client + server action); friendly field-level errors.
- Every list has: loading skeleton, designed empty state (icon + one-line explanation +
  primary action), and mobile-responsive layout.
- Dates/times via `date-fns` and the existing `lib/format.ts` helpers; all times shown in
  the airline's local convention already used by FlightBook.
- Accessible: labels on all inputs, focus states, AA contrast in both themes.

## 9. Explicitly out of scope (v1)

Multi-currency, dangerous-goods documentation (DG is simply blocked), customs/EDI
integrations (CargoIMP/CargoXML), ULD/container planning, multi-leg routing with transfers,
customer self-service portal (beyond public tracking), and email/SMS notifications. These
are natural v2 items; nothing in the v1 schema should make them impossible.
