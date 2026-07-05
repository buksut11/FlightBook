# Plan 2 — Rate cards, chargeable-weight math, quote calculator

**Read `docs/cargo/SPEC.md` (§4, §6.3) first.** Requires Plan 1.

## Build

### 1. Migration `supabase/migrations/0009_cargo_rates.sql`

- `rate_cards`: id, `origin_airport_id`, `destination_airport_id`, `commodity_id`
  (nullable = "any commodity"), `valid_from` date, `min_charge` numeric, `active` boolean,
  timestamps. Staff read; admin write. Unique on (origin, destination, commodity, valid_from).
- `rate_breaks`: id, `rate_card_id` FK (cascade), `min_weight_kg` numeric (0, 45, 100, 300,
  500 are the typical breaks but any values allowed), `price_per_kg` numeric. Unique on
  (rate_card_id, min_weight_kg).

### 2. Rating engine `lib/cargo/rating.ts` (pure functions + heavy tests)

- `volumetricWeight(pieces, divisor)`: Σ count × (L×W×H cm)/divisor.
- `chargeableWeight(grossKg, volumetricKg)`: max of the two, **rounded up to next 0.5 kg**.
- `freightCharge(chargeableKg, card)`: for the applicable break, compare
  `breakPrice × weight` vs `nextBreakPrice × nextBreakMinWeight` and take the **cheaper**
  (standard air-cargo "as-higher-break" rule); never below `min_charge`.
- `totalCharges(freight, settings)`: freight + fuel% + security% + AWB fee → itemized object.
- `pickRateCard(cards, commodityId)`: exact commodity beats "any"; latest `valid_from` (≤
  today) wins; inactive cards ignored.
- Vitest coverage in `lib/cargo/rating.test.ts`: rounding edges (e.g. 45.01 → 45.5),
  break-jump cheaper case, min-charge floor, no-card case, zero/invalid dims rejected.

### 3. Screens

- `/settings/rates` (admin): list of rate cards (route, commodity, valid-from, min charge,
  active badge); create/edit dialog with an inline weight-break table (add/remove rows, must
  include a 0-kg break, Zod: ascending weights, positive prices).
- `/cargo/quote` (all staff): the calculator. Origin/destination selects (existing airports),
  commodity select (dangerous ones disabled with a tooltip "Dangerous goods cannot be
  booked"), pieces table (count, L, W, H, weight per piece, add/remove rows). A summary card
  updates live: gross / volumetric / **chargeable** kg, then freight, surcharges, fee,
  **total** — or a clear "No rate card for this route" notice. Buttons: **Save as draft
  shipment** (disabled until Plan 3 — render it disabled with tooltip "Coming with
  shipments") and **Clear**.

## How to verify

1. Run migration 0009.
2. As admin, create a rate card for a route you have airports for: min charge 50, breaks
   0→4.00, 45→3.20, 100→2.60 per kg.
3. Quote 1 piece 100×50×40 cm, 20 kg → volumetric 33.3, chargeable 33.5, freight = max(50,
   33.5×4.00=134) → 134, plus your surcharge percentages.
4. Quote 44 kg → check it charges 45×3.20 = 144 (cheaper than 44×4.00 = 176).
5. Pick the dangerous commodity — it's disabled and explains why.
6. Route with no card → friendly notice, no crash. Lint/test/build pass.
