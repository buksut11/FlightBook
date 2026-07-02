# Flight Booking System

Internal flight ticket booking system for staff (admin / agent roles).

Built with Next.js 15 (App Router, TypeScript strict), Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Tailwind CSS, shadcn/ui, next-themes (light/dark), Zod, and Vitest.

## What's implemented (Plan 1: Foundation & Authentication)

- Next.js 15 scaffold with the spec palette (sky-blue primary `#0284c7` / `#38bdf8` dark, slate backgrounds) and a light/dark theme toggle.
- Supabase browser + server clients and middleware that refreshes sessions and redirects unauthenticated users to `/login`.
- `profiles` table migration with `is_admin()` / `is_active_staff()` role helpers and RLS policies (`supabase/migrations/0001_profiles.sql`).
- Login page with Zod-validated server actions and a deactivated-account guard (deactivated staff are signed out and locked out).
- Protected dashboard shell: role-aware sidebar (admin sees Reports + Settings), mobile bottom nav, user menu with sign-out.

## One-time Supabase setup (manual)

The app needs a Supabase project; these steps are done once in the [Supabase dashboard](https://supabase.com):

1. **Create the project.** New Project → name `flight-booking`, strong DB password, nearest region. Under Project Settings → API, copy the Project URL and `anon` key.
2. **Lock down sign-ups.** Authentication → Providers: ensure Email is enabled. Authentication → Sign In / Up: **disable** "Allow new users to sign up" (staff are created by the admin only).
3. **Configure env vars.** Copy `.env.example` to `.env.local` and fill in the real values. Never commit `.env.local` or expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
4. **Apply the migration.** SQL Editor → paste the contents of `supabase/migrations/0001_profiles.sql` → Run. Expect "Success. No rows returned."
5. **Create the first admin.** Authentication → Users → "Add user" (email + password, check "Auto Confirm User"), copy the new user's UUID, then run `supabase/seed/first_admin.sql` in the SQL Editor with the real UUID and name.

## Development

```bash
npm install
npm run dev     # http://localhost:3000 — redirects to /login when signed out
npm test        # Vitest unit tests
npm run build   # production build (type-checks)
```

Requires Node ≥ 20.

## Project layout

- `app/login/` — login page + `login` / `logout` server actions
- `app/(dashboard)/` — protected route group; all future screens live here
- `lib/supabase/` — `createClient()` for browser, server, and middleware
- `lib/auth/get-profile.ts` — loads the signed-in staff profile (redirects if missing/inactive)
- `components/nav-links.ts` — role-aware navigation definition later plans extend
- `supabase/migrations/` — numbered SQL applied via the Dashboard SQL Editor
