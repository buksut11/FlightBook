# Plan 1 — Cargo foundation: navigation, customers, commodities, settings

**Read `docs/cargo/SPEC.md` first.** This plan creates the cargo section of the app and the
reference data everything else depends on. No shipments yet.

## Build

### 1. Migration `supabase/migrations/0008_cargo_foundation.sql`

- `cargo_customers`: id (uuid pk), `kind` (`company`/`individual`), `name`, `contact_person`,
  `phone`, `email`, `address`, `city`, `country`, `tax_id`, `notes`, timestamps. Staff
  read/write via existing `is_active_staff()` RLS pattern (copy the style of `0002`/`0003`).
- `commodities`: id, `code` (unique, uppercase, 3 chars), `name`, `is_dangerous`,
  `requires_cold_chain`, `is_valuable`, `active` boolean. Staff read; admin write.
  Seed in the migration: GEN General cargo, DOC Documents, PER Perishables, ELE Electronics,
  PHA Pharmaceuticals, TEX Textiles, SPX Spare parts, VAL Valuables (is_valuable),
  COL Cold chain (requires_cold_chain), DGR Dangerous goods (is_dangerous).
- `cargo_settings`: single-row table (enforce with a check on a constant id):
  `awb_prefix` char(3) default '999', `volumetric_divisor` int default 6000,
  `fuel_surcharge_pct` numeric default 0, `security_surcharge_pct` numeric default 0,
  `awb_fee` numeric default 0. Staff read; admin write. Seed the row.
- Extend `aircraft` with `cargo_capacity_kg` numeric default 0 and `cargo_capacity_m3`
  numeric default 0.

### 2. Navigation

Add a **Cargo** group to `components/nav-links.ts` and the sidebar: Shipments, Quote,
Customers, Flights (cargo) — routes may 404 for now except Customers. Add **Commodities**
and **Cargo settings** cards/links to the existing admin `/settings` page, and cargo
capacity fields to the existing aircraft dialog.

### 3. Screens

- `/cargo/customers`: searchable list (name/phone/email, search-as-you-type like the
  existing customers screen), "New customer" dialog, edit dialog. Zod schema in
  `lib/validations/cargo-customer.ts` (+ tests): name required, email format, phone required.
- `/cargo/customers/[id]`: detail page with contact card and an empty "Shipments" section
  labeled "No shipments yet" (wired up in Plan 3).
- `/settings/commodities` (admin): table of commodities with add/edit dialog and
  active/inactive toggle; dangerous/cold-chain/valuable shown as small badges.
- `/settings/cargo` (admin): form for the `cargo_settings` row (Zod-validated: prefix is
  exactly 3 digits, divisor ≥ 1000, percentages 0–100).

Follow existing patterns exactly: server components for pages, server actions in
`actions.ts`, dialogs as client components, toasts on success/failure, loading skeletons,
designed empty states.

## How to verify (non-developer checklist)

1. Run the migration in Supabase SQL Editor — "Success. No rows returned."
2. `npm run dev`, log in — sidebar shows a Cargo section.
3. Create a cargo customer; search finds it by part of the name; edit works.
4. As admin: Settings shows Commodities (10 seeded rows) and Cargo settings; change the
   AWB prefix to your airline's 3 digits and save; reload — value persisted.
5. Edit an aircraft — it now has cargo capacity (kg and m³) fields that save.
6. As a non-admin agent: the two new settings pages are not accessible.
7. `npm run lint`, `npm test`, `npm run build` all pass.
