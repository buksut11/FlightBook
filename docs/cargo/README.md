# CargoBook — Cargo Management System (Specs & Build Plans)

This folder contains everything an AI coding assistant needs to build a complete,
professional air-cargo management system **inside this FlightBook project**, reusing
the login, staff, airports, aircraft, and flights that already exist.

## What's in this folder

| File | What it is |
| --- | --- |
| `SPEC.md` | The full product specification — features, screens, data model, design rules. The AI should treat this as the source of truth. |
| `plans/plan-01-…` → `plans/plan-09-…` | Nine build plans, in order. Each one is a self-contained task sized for a single AI coding session. |

## How to use this (you don't need to be a developer)

1. **Work through the plans in order, one at a time.** Each plan builds on the previous one.
2. **Start each AI session with this exact message:**

   > Read `docs/cargo/SPEC.md` for full context, then implement `docs/cargo/plans/plan-0X-….md`
   > exactly as written. Follow the existing code style of this repository. When you are done,
   > run `npm run lint`, `npm test`, and `npm run build`, fix anything that fails, and commit.

3. **Apply the database migration.** Most plans add a SQL file under `supabase/migrations/`.
   Open your [Supabase dashboard](https://supabase.com) → SQL Editor → paste the new file's
   contents → Run. Do this before testing the plan's features.
4. **Test it yourself.** Every plan ends with a "How to verify" checklist written in plain
   language — click through it in the running app (`npm run dev`).
5. **Only move to the next plan when the current one works.** If something is broken, tell
   the AI what you saw and ask it to fix it before continuing.

## Build order at a glance

1. **Plan 1 — Foundation:** cargo navigation, customers (shippers/consignees), commodity settings
2. **Plan 2 — Rates & quotes:** rate cards, chargeable-weight math, instant quote calculator
3. **Plan 3 — Shipments (AWB):** the booking wizard that creates air waybills
4. **Plan 4 — Capacity & manifests:** assign shipments to flights without overloading them
5. **Plan 5 — Warehouse operations:** acceptance, weight verification, status milestones
6. **Plan 6 — Tracking:** internal timeline + public "track my shipment" page
7. **Plan 7 — Documents:** printable AWB, barcode piece labels, flight cargo manifest (PDF)
8. **Plan 8 — Payments & invoicing:** record payments, balances, printable invoices
9. **Plan 9 — Dashboard & reports:** cargo KPIs, revenue/tonnage reports, CSV export

Rough expectation: each plan is one focused AI session. The whole system is nine sessions.
