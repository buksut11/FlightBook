# Flight Booking System

Internal staff-only flight ticket booking app for a travel agency running its own inventory.
Next.js 15 (App Router) + Supabase (Postgres, Auth, Storage, RLS) + Tailwind + shadcn/ui.

## Features
- Email/password staff login (admin + agent roles), no public signup
- Flight, airport, and aircraft management (admin)
- One-way and round-trip bookings with a guided wizard
- Customer records with phone-lookup autofill and booking history
- Manual mobile-money / cash payments with automatic confirmation
- Discounts, extra baggage, per-class seat inventory (no oversell — enforced in Postgres)
- Printable A5 PDF tickets
- Dashboard + admin reports with CSV export
- Staff management (create accounts, reset passwords, deactivate)
- Profile avatars (Supabase Storage)

## Local setup
1. `npm install`
2. Create a Supabase project; copy `.env.example` to `.env.local` and fill in the URL, anon key, and service-role key.
3. In the Supabase SQL Editor, run the migrations in `supabase/migrations/` in filename order (0001 → 0007).
4. Create the `avatars` storage bucket (public) — see `supabase/migrations/0007_avatars_storage.sql` for its policies.
5. Create the first admin: add an auth user in the dashboard, then run `supabase/seed/first_admin.sql` with its UUID.
6. (Optional) run `supabase/seed/demo_data.sql` for sample flights.
7. `npm run dev`

## Tests
- Unit: `npm test` (Vitest)
- End-to-end: `npm run e2e` (Playwright; requires the E2E_* env vars and two active accounts)

## Deployment
Push to GitHub, import into Vercel (Next.js preset), set the env vars documented in
`.env.production.example`, and set the Vercel URL as the Site URL in Supabase
Authentication → URL Configuration.

## Known limitations / future work
- Dev and prod share one Supabase project; split them for a larger deployment.
- Payments are recorded manually; WaafiPay API integration is a future addition (the schema already isolates payment records).
- Reporting currency is assumed USD in a few labels; make fully multi-currency if needed.
