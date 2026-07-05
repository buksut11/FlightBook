# Plan 9 — Cargo dashboard, reports & final polish

**Read `docs/cargo/SPEC.md` (§6.11, §8) first.** Requires Plan 8. This plan finishes v1.

## Build

### 1. Migration `supabase/migrations/0015_cargo_reporting.sql`

Reporting functions/views (admin-gated like `0006_reporting.sql`): date-range cargo revenue
(from payments) and billed totals (from shipments), tonnage (chargeable kg) flown, shipment
counts by status, top 10 customers by revenue, top routes by tonnage, and the dashboard
counters below.

### 2. Dashboard (existing home page gains a Cargo section)

Stat cards: shipments booked today, kg awaiting acceptance, shipments flying today, total
unpaid balance (collect + prepaid outstanding). Below: **Needs attention** list — accepted
but unmanifested shipments whose chosen flight departs within 24 h, and booked shipments
older than 48 h not yet accepted — each row links to the shipment. Empty state: "All caught
up ✈️".

### 3. Reports (`/reports`, admin): add a **Cargo** tab

Date-range picker (reuse the existing component): revenue vs billed, tonnage, shipments by
status (small bars), top customers table, top routes table. **Export CSV** mirroring the
existing export route (`/reports/cargo/export?from=…&to=…`) with one row per shipment in
range: AWB, dates, route, parties, kg, charges, paid, balance, status.

### 4. Final polish pass (whole cargo module)

- Audit every cargo screen against SPEC §8: loading skeletons, designed empty states,
  mobile layouts, dark mode, focus states, toasts on every action.
- Consistent status badge colors everywhere (list, detail, flights, dashboard, track page).
- Sidebar: cargo section shows a live count badge of shipments awaiting acceptance.
- Update the project `README.md` with a CargoBook section (features + migration list
  0008–0015 + the public `/track` page).

## How to verify

1. Run migration 0015.
2. Dashboard shows correct counts matching what you created in earlier plans; every
   "needs attention" row opens the right shipment.
3. Reports → Cargo tab: pick a range covering your test data — revenue, tonnage, and top
   customers look right; CSV downloads and opens in a spreadsheet with sensible columns.
4. Non-admin agents see the dashboard cargo cards but not the reports tab.
5. Click through every cargo screen at phone width and in dark mode — nothing broken.
6. `npm run lint`, `npm test`, `npm run build` all pass. 🎉 v1 complete.
