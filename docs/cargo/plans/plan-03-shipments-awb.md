# Plan 3 — Shipments: AWB numbers, booking wizard, list & detail

**Read `docs/cargo/SPEC.md` (§5, §6.4, §6.5) first.** Requires Plans 1–2. This is the
biggest plan — the core object of the whole system.

## Build

### 1. Migration `supabase/migrations/0010_shipments.sql`

- `shipments`: id, `awb` text unique nullable (null while draft), shipper/consignee FKs to
  `cargo_customers`, origin/destination airport FKs, `flight_id` nullable FK, `commodity_id`
  FK, `description`, `declared_value` numeric, `status` enum-style check
  (`draft/booked/accepted/manifested/departed/arrived/delivered/cancelled`), `payment_terms`
  (`prepaid`/`collect`), weight/volume totals (gross_kg, volumetric_kg, chargeable_kg,
  volume_m3), charges (freight, fuel_surcharge, security_surcharge, awb_fee, total),
  `manual_rate` boolean, `cancel_reason`, `created_by` FK to profiles, timestamps.
- `shipment_pieces`: shipment FK (cascade), `pieces_count` int, dims cm, `weight_kg`;
  columns for verified values added in Plan 5 — keep booked values only for now.
- `cargo_events`: shipment FK, `event_type` text, `staff_id` FK, `note`, `created_at`.
- AWB issuance: sequence `awb_serial_seq` + function `issue_awb()` returning
  `prefix || '-' || lpad(serial,7,'0') || (serial % 7)` using `cargo_settings.awb_prefix`.
- `book_shipment(...)` SECURITY DEFINER function: validates the caller is active staff,
  inserts shipment + pieces + a `booked` event, issues the AWB, and — if a flight is chosen —
  verifies the flight is upcoming and not cancelled. All-or-nothing.
- `transition_shipment(shipment_id, new_status, note)` function enforcing the forward-only
  lifecycle from SPEC §5 (cancel allowed before `departed`; only admins after `manifested`)
  and writing the matching `cargo_events` row. UI must always go through this function.

### 2. Booking wizard `/cargo/shipments/new`

Four steps as SPEC §6.4, matching the visual style of the existing passenger booking wizard:
route & optional flight (show each upcoming flight's remaining cargo kg) → parties (search
`cargo_customers`, inline-create dialog) → cargo (commodity, description, declared value,
pieces table with live chargeable-weight totals from `lib/cargo/rating.ts`) → charges &
confirm (rated breakdown; if no rate card, admin-or-agent may tick "Manual rate" and enter
freight manually, stored with `manual_rate = true`; choose prepaid/collect) → **Book** →
success page with big AWB number and links (view shipment / new shipment). Also wire the
Plan 2 quote page's "Save as draft shipment" button: creates a `draft` (no AWB) and opens
the wizard pre-filled; drafts get an AWB only when booked.

### 3. List `/cargo/shipments` and detail `/cargo/shipments/[id]`

- List: columns AWB (or "Draft"), route, shipper → consignee, pieces / chargeable kg,
  flight, status badge (distinct color per status), total. Filters: status, date range;
  search by AWB / shipper / consignee (server-side, like existing bookings list).
- Detail: header (AWB, status badge, route, flight), parties card, pieces table, charges
  breakdown card, event timeline (newest first), and an actions area: **Book** (drafts),
  **Cancel** (dialog with required reason). Later plans add more actions here — structure it
  so they slot in.
- Customer detail (`/cargo/customers/[id]`): replace the placeholder with the customer's
  shipments (as shipper or consignee) + lifetime totals.
- Zod schemas in `lib/validations/shipment.ts` with tests (pieces ≥ 1, weights > 0, dims
  > 0, shipper ≠ consignee not required but same-airport route rejected).

## How to verify

1. Run migration 0010.
2. Book a shipment end-to-end → success page shows an AWB like `999-00000011`; the last
   digit equals the serial mod 7.
3. Its detail page shows correct chargeable weight and totals matching the quote screen.
4. The shipments list finds it by partial AWB and by shipper name; status filter works.
5. Cancel a booked shipment → status `cancelled`, reason in the timeline; the "book a
   cancelled flight" path is impossible (cancelled flights don't appear in step 1).
6. A draft from the quote page has no AWB until booked. Lint/test/build pass.
