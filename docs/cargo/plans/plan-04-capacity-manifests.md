# Plan 4 — Flight cargo capacity & manifesting

**Read `docs/cargo/SPEC.md` (§6.6) first.** Requires Plan 3.

## Build

### 1. Migration `supabase/migrations/0011_manifesting.sql`

- View or function giving per-flight cargo load: booked+ shipments' chargeable kg and m³
  vs the aircraft's `cargo_capacity_kg` / `cargo_capacity_m3`.
- `manifest_shipment(shipment_id, flight_id)` SECURITY DEFINER function: shipment must be
  `accepted` (or `booked` — see note below), routes must match the flight, flight upcoming
  and not cancelled, and adding it must not exceed remaining kg **or** m³ (lock the flight
  row to prevent double-booking races). Sets status `manifested`, sets `flight_id`, writes
  the event. **Note:** until Plan 5 exists, allow manifesting from `booked` as well; Plan 5
  will tighten this to `accepted` only.
- `unmanifest_shipment(shipment_id)`: admin only, back to `accepted` (or `booked`), event
  logged.
- `depart_flight(flight_id)` / `arrive_flight(flight_id)`: bulk-transition all of that
  flight's `manifested` → `departed` → `arrived` shipments with events.

### 2. Screens

- `/cargo/flights`: upcoming flights with route, date, aircraft, and **two load bars** (kg
  and m³, reusing the existing load-bar component style; red when > 90%).
- `/cargo/flights/[id]`: capacity summary, table of shipments on this flight, **Add
  shipments** panel listing compatible unmanifested shipments (matching route, status
  eligible, shows each one's kg/m³ and disables rows that would not fit, with the reason),
  and **Depart** / **Arrive** buttons with confirmation dialogs stating how many shipments
  will move.
- Shipment detail: add **Manifest** action (dialog to pick a compatible flight) and, for
  admins, **Remove from flight**.

## How to verify

1. Run migration 0011. Give an aircraft e.g. 2 000 kg / 20 m³ capacity.
2. Book two shipments on the same route; manifest both onto one flight — load bars rise.
3. Try to manifest a shipment that exceeds remaining capacity — the row is disabled with a
   reason, and even a forced attempt is rejected with a clear error toast.
4. Depart the flight → both shipments show `departed` and it's in their timelines; Arrive →
   `arrived`.
5. As admin, remove one from the flight before departure — capacity frees up.
6. Lint/test/build pass.
