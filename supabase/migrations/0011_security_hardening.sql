-- Security hardening for the booking and payment RPCs.
--
-- Run this whole file in the Supabase Dashboard SQL Editor, after 0010.
-- It is idempotent: every statement is a `create or replace`, so a partially
-- applied run can simply be re-run from the top.
--
-- Background: the Supabase anon key ships in the browser bundle and every
-- staff member holds a valid JWT, so any agent can call PostgREST directly and
-- skip the Next.js server actions entirely. The Zod schemas in
-- lib/validations/ are therefore input hygiene, not security controls — the
-- only rules that actually bind are the ones written here and in the RLS
-- policies. Each fix below mirrors a rule that previously existed only in Zod
-- or in the UI.
--
-- Fixes:
--   1. create_booking applied discounts with no upper bound at any layer, so
--      an agent could issue a 100%-discount (free) ticket that still reserved
--      a real seat and still produced a valid ticket PDF. Percent discounts
--      are now range-checked, and any discount above the agent ceiling
--      requires an admin.
--   2. record_payment checked only is_active_staff(), so any agent could
--      fabricate a payment against ANY booking in the system — confirming
--      unpaid bookings and inflating their own revenue figures. It now
--      enforces the same ownership rule cancel_booking already used, and
--      rejects amounts above what the booking actually owes.
--   3. The passenger count was unbounded server-side (Zod capped it at 9, the
--      RPC only checked >= 1), so a single call could take an entire cabin and
--      hold it indefinitely. It is now capped in the RPC.
--   9. protect_booking_columns did not cover the discount, baggage, customer,
--      currency or created_by columns, so an agent could PATCH their own
--      pending booking to set discount_type='none' and erase the discount from
--      the admin report while the money stayed gone. All money-bearing and
--      attribution-bearing columns are now protected.
--
-- ---------------------------------------------------------------------------
-- BEFORE APPLYING — one business decision to confirm
-- ---------------------------------------------------------------------------
-- create_booking below caps non-admin discounts at 10% of the fare
-- (v_agent_discount_ceiling_pct). Anything above that raises
-- DISCOUNT_NEEDS_ADMIN and must be applied by an admin account. If your agents
-- routinely grant larger discounts, raise that constant before running this
-- file, or bookings that used to succeed will start failing. Set it to 100 to
-- keep discounts unrestricted for agents and rely only on the range check.

-- ---------------------------------------------------------------------------
-- Finding 9: protect every money-bearing and attribution-bearing column.
--
-- Newly protected: discount_type, discount_value, discount_reason,
-- extra_baggage_kg, extra_baggage_fee, customer_id, currency, created_by.
-- None of these has a legitimate direct-UPDATE path — the RPCs own every
-- legitimate write, and no application code updates the bookings table at all
-- (verified: all reads). The `edit own pending or admin` RLS policy stays as
-- it is; this trigger is what makes it safe.
--
-- Also pins search_path, which was missing (harmless today because the
-- function is not SECURITY DEFINER, but this is a trigger enforcing a security
-- control and the omission is a latent footgun).
-- ---------------------------------------------------------------------------

create or replace function public.protect_booking_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.rpc', true), '') = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.reference is distinct from old.reference
     or new.flight_id is distinct from old.flight_id
     or new.cabin_class is distinct from old.cabin_class
     or new.passenger_count is distinct from old.passenger_count
     or new.subtotal is distinct from old.subtotal
     or new.total_amount is distinct from old.total_amount
     or new.carried_balance is distinct from old.carried_balance
     or new.linked_booking_id is distinct from old.linked_booking_id
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancelled_at is distinct from old.cancelled_at
     -- added in 0011: previously unprotected, and all of them either move
     -- money or move responsibility for it
     or new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
     or new.discount_reason is distinct from old.discount_reason
     or new.extra_baggage_kg is distinct from old.extra_baggage_kg
     or new.extra_baggage_fee is distinct from old.extra_baggage_fee
     or new.customer_id is distinct from old.customer_id
     or new.currency is distinct from old.currency
     or new.created_by is distinct from old.created_by then
    raise exception 'PROTECTED_COLUMNS: use the booking RPC functions';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Findings 1 + 3: create_booking with discount and passenger-count limits.
--
-- Unchanged from 0009 apart from the validation block marked "0011" and the
-- discount ceiling check. Seat locking, tiered pricing, balance carry-forward
-- and event logging all behave exactly as before.
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(
  p_flight_id uuid,
  p_cabin_class text,
  p_passengers jsonb,                 -- [{"full_name","id_number","passenger_type"}]
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_return_flight_id uuid default null,
  p_return_cabin_class text default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0,
  p_discount_reason text default null,
  p_extra_baggage_kg int default 0,
  p_extra_baggage_fee numeric default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- Booking-size cap. Mirrors the .max(9) in lib/validations/booking.ts, which
  -- an agent calling PostgREST directly does not go through.
  v_max_passengers constant int := 9;
  -- Largest discount a non-admin may grant, as a percentage of the fare.
  -- See the note at the top of this file before changing.
  v_agent_discount_ceiling_pct constant numeric := 10;

  v_agent uuid := auth.uid();
  v_customer_id uuid;
  v_count int := coalesce(jsonb_array_length(p_passengers), 0);
  v_adults int;
  v_children int;
  v_infants int;
  v_is_round boolean := p_return_flight_id is not null;
  v_out public.flights;
  v_ret public.flights;
  v_out_subtotal numeric;
  v_ret_subtotal numeric := 0;
  v_discount numeric := 0;
  v_discount_ceiling numeric;
  v_carried numeric := 0;
  v_transfers jsonb := '[]'::jsonb;
  v_out_total numeric;
  v_out_id uuid;
  v_ret_id uuid;
  v_out_ref text;
  v_ret_ref text;
  v_p jsonb;
begin
  perform set_config('app.rpc', 'on', true);

  if not public.is_active_staff() then
    raise exception 'NOT_STAFF';
  end if;
  if v_count < 1 then
    raise exception 'CUSTOMER_REQUIRED: at least one passenger';
  end if;
  if v_is_round and p_return_cabin_class is null then
    raise exception 'RETURN_REQUIRED: return cabin class missing';
  end if;

  -- 0011 (finding 3): cap the booking size. Without this, a direct API call
  -- could submit exactly seats_available_* passengers and hold an entire
  -- cabin — there is no pending-booking expiry, so those seats never return.
  if v_count > v_max_passengers then
    raise exception 'TOO_MANY_PASSENGERS:%', v_max_passengers;
  end if;

  -- 0011: validate the passenger payload itself. A passenger_type outside the
  -- allowed set is counted in none of the three fare buckets below, which
  -- would price the booking for fewer passengers than the seats it consumes.
  -- (The passengers CHECK constraint would eventually abort the transaction,
  -- but only after the pricing arithmetic had silently gone wrong.)
  if exists (
    select 1 from jsonb_array_elements(p_passengers) p
    where coalesce(p->>'passenger_type', 'adult') not in ('adult', 'child', 'infant')
  ) then
    raise exception 'INVALID_PASSENGER_TYPE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_passengers) p
    where coalesce(trim(p->>'full_name'), '') = ''
  ) then
    raise exception 'PASSENGER_NAME_REQUIRED';
  end if;

  -- 0011 (finding 1): range-check the discount inputs. p_discount_value was
  -- previously unbounded — a percent value of 100 zeroed the fare outright.
  if p_discount_type is null or p_discount_type not in ('none', 'percent', 'fixed') then
    raise exception 'INVALID_DISCOUNT';
  end if;
  if coalesce(p_discount_value, 0) < 0 then
    raise exception 'INVALID_DISCOUNT';
  end if;
  if p_discount_type = 'percent' and coalesce(p_discount_value, 0) > 100 then
    raise exception 'INVALID_DISCOUNT';
  end if;
  if coalesce(p_extra_baggage_fee, 0) < 0 or coalesce(p_extra_baggage_kg, 0) < 0 then
    raise exception 'INVALID_BAGGAGE';
  end if;

  select
    count(*) filter (where coalesce(p->>'passenger_type', 'adult') = 'adult'),
    count(*) filter (where p->>'passenger_type' = 'child'),
    count(*) filter (where p->>'passenger_type' = 'infant')
  into v_adults, v_children, v_infants
  from jsonb_array_elements(p_passengers) p;

  -- 0011: the fare buckets must account for every passenger, or the booking
  -- is priced for fewer people than it seats.
  if v_adults + v_children + v_infants <> v_count then
    raise exception 'INVALID_PASSENGER_TYPE';
  end if;

  -- customer: existing id, or find-by-phone, or create
  if p_customer_id is not null then
    v_customer_id := p_customer_id;
  else
    if p_customer_name is null or p_customer_phone is null then
      raise exception 'CUSTOMER_REQUIRED: name and phone';
    end if;
    select id into v_customer_id from public.customers
      where phone = p_customer_phone limit 1;
    if v_customer_id is null then
      insert into public.customers (full_name, phone, email)
      values (p_customer_name, p_customer_phone, p_customer_email)
      returning id into v_customer_id;
    end if;
  end if;

  -- lock flight rows in a consistent order (by id) to avoid deadlocks
  for v_out in
    select * from public.flights
    where id in (p_flight_id, p_return_flight_id)
    order by id
    for update
  loop
    null; -- rows are now locked; re-select each below
  end loop;

  select * into v_out from public.flights where id = p_flight_id;
  if not found then raise exception 'FLIGHT_NOT_FOUND:%', p_flight_id; end if;
  if v_out.status <> 'scheduled' then
    raise exception 'FLIGHT_NOT_BOOKABLE:%', v_out.flight_number;
  end if;

  if v_is_round then
    select * into v_ret from public.flights where id = p_return_flight_id;
    if not found then raise exception 'FLIGHT_NOT_FOUND:%', p_return_flight_id; end if;
    if v_ret.status <> 'scheduled' then
      raise exception 'FLIGHT_NOT_BOOKABLE:%', v_ret.flight_number;
    end if;
    if v_ret.departure_at <= v_out.departure_at then
      raise exception 'RETURN_BEFORE_OUTBOUND:%', v_ret.flight_number;
    end if;
  end if;

  -- seat + price checks per leg (nothing is written until all legs pass)
  if p_cabin_class = 'economy' then
    if v_out.seats_available_economy < v_count then
      raise exception 'SOLD_OUT:%:%', v_out.flight_number, v_out.seats_available_economy;
    end if;
  else
    if v_out.price_business is null then
      raise exception 'NO_BUSINESS_CABIN:%', v_out.flight_number;
    end if;
    if v_out.seats_available_business < v_count then
      raise exception 'SOLD_OUT:%:%', v_out.flight_number, v_out.seats_available_business;
    end if;
  end if;

  if v_is_round then
    if p_return_cabin_class = 'economy' then
      if v_ret.seats_available_economy < v_count then
        raise exception 'SOLD_OUT:%:%', v_ret.flight_number, v_ret.seats_available_economy;
      end if;
    else
      if v_ret.price_business is null then
        raise exception 'NO_BUSINESS_CABIN:%', v_ret.flight_number;
      end if;
      if v_ret.seats_available_business < v_count then
        raise exception 'SOLD_OUT:%:%', v_ret.flight_number, v_ret.seats_available_business;
      end if;
    end if;
  end if;

  -- decrement seats
  if p_cabin_class = 'economy' then
    update public.flights set seats_available_economy = seats_available_economy - v_count
      where id = p_flight_id;
  else
    update public.flights set seats_available_business = seats_available_business - v_count
      where id = p_flight_id;
  end if;
  if v_is_round then
    if p_return_cabin_class = 'economy' then
      update public.flights set seats_available_economy = seats_available_economy - v_count
        where id = p_return_flight_id;
    else
      update public.flights set seats_available_business = seats_available_business - v_count
        where id = p_return_flight_id;
    end if;
  end if;

  -- money: tiered fares per passenger type; discount + extra baggage live on
  -- the outbound leg
  v_out_subtotal := public.leg_subtotal(v_out, p_cabin_class, v_adults, v_children, v_infants);
  if v_is_round then
    v_ret_subtotal := public.leg_subtotal(v_ret, p_return_cabin_class, v_adults, v_children, v_infants);
  end if;

  if p_discount_type = 'percent' then
    v_discount := round((v_out_subtotal + v_ret_subtotal) * p_discount_value / 100.0, 2);
  elsif p_discount_type = 'fixed' then
    v_discount := p_discount_value;
  end if;
  if v_discount > v_out_subtotal + v_ret_subtotal then
    v_discount := v_out_subtotal + v_ret_subtotal;
  end if;

  -- 0011 (finding 1): an agent may not grant more than the ceiling. Checked
  -- against the resolved amount, so it catches percent and fixed alike.
  -- Raising here rolls back the seat decrements above with the transaction.
  if v_discount > 0 and not public.is_admin() then
    v_discount_ceiling :=
      round((v_out_subtotal + v_ret_subtotal) * v_agent_discount_ceiling_pct / 100.0, 2);
    if v_discount > v_discount_ceiling then
      raise exception 'DISCOUNT_NEEDS_ADMIN:%', v_agent_discount_ceiling_pct;
    end if;
  end if;

  v_out_total := v_out_subtotal - v_discount + coalesce(p_extra_baggage_fee, 0);
  if v_out_total < 0 then v_out_total := 0; end if;

  -- carry any unpaid balance from the customer's earlier bookings (same
  -- currency) into this booking's amount due
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', bb.id, 'reference', bb.reference, 'balance', bb.balance)), '[]'::jsonb),
    coalesce(sum(bb.balance), 0)
  into v_transfers, v_carried
  from public.booking_balances bb
  where bb.customer_id = v_customer_id
    and bb.balance > 0
    and bb.currency = v_out.currency;

  v_out_total := v_out_total + v_carried;

  v_out_ref := public.generate_booking_reference();
  insert into public.bookings (
    reference, flight_id, customer_id, created_by, cabin_class, passenger_count,
    trip_type, subtotal, discount_type, discount_value, discount_reason,
    extra_baggage_kg, extra_baggage_fee, carried_balance, total_amount, currency
  ) values (
    v_out_ref, p_flight_id, v_customer_id, v_agent, p_cabin_class, v_count,
    case when v_is_round then 'round_trip' else 'one_way' end,
    v_out_subtotal, p_discount_type, coalesce(p_discount_value, 0), p_discount_reason,
    coalesce(p_extra_baggage_kg, 0), coalesce(p_extra_baggage_fee, 0),
    v_carried, v_out_total, v_out.currency
  ) returning id into v_out_id;

  if v_is_round then
    v_ret_ref := public.generate_booking_reference();
    insert into public.bookings (
      reference, flight_id, customer_id, created_by, cabin_class, passenger_count,
      trip_type, linked_booking_id, subtotal, total_amount, currency
    ) values (
      v_ret_ref, p_return_flight_id, v_customer_id, v_agent, p_return_cabin_class, v_count,
      'round_trip', v_out_id, v_ret_subtotal, v_ret_subtotal, v_ret.currency
    ) returning id into v_ret_id;

    update public.bookings set linked_booking_id = v_ret_id where id = v_out_id;
  end if;

  if v_carried > 0 then
    insert into public.balance_transfers (from_booking_id, to_booking_id, amount, created_by)
    select (t->>'id')::uuid, v_out_id, (t->>'balance')::numeric, v_agent
    from jsonb_array_elements(v_transfers) t;

    insert into public.booking_events (booking_id, actor_id, event, details)
    values (v_out_id, v_agent, 'balance_carried',
            jsonb_build_object('amount', v_carried, 'from', v_transfers));
  end if;

  -- passengers (copied to both legs for round trips)
  for v_p in select * from jsonb_array_elements(p_passengers) loop
    insert into public.passengers (booking_id, full_name, id_number, passenger_type)
    values (
      v_out_id,
      v_p->>'full_name',
      v_p->>'id_number',
      coalesce(v_p->>'passenger_type', 'adult')
    );
    if v_is_round then
      insert into public.passengers (booking_id, full_name, id_number, passenger_type)
      values (
        v_ret_id,
        v_p->>'full_name',
        v_p->>'id_number',
        coalesce(v_p->>'passenger_type', 'adult')
      );
    end if;
  end loop;

  insert into public.booking_events (booking_id, actor_id, event, details)
  values (v_out_id, v_agent, 'created',
          jsonb_build_object('trip_type', case when v_is_round then 'round_trip' else 'one_way' end,
                             'discount', v_discount,
                             'carried_balance', v_carried));
  if p_discount_type <> 'none' then
    insert into public.booking_events (booking_id, actor_id, event, details)
    values (v_out_id, v_agent, 'discount_applied',
            jsonb_build_object('type', p_discount_type, 'value', p_discount_value,
                               'reason', p_discount_reason,
                               -- record the resolved amount and who authorised
                               -- it, so the report is not the only evidence
                               'amount', v_discount,
                               'by_admin', public.is_admin()));
  end if;
  if v_is_round then
    insert into public.booking_events (booking_id, actor_id, event, details)
    values (v_ret_id, v_agent, 'created', jsonb_build_object('leg', 'return'));
  end if;

  return jsonb_build_object(
    'booking_id', v_out_id,
    'reference', v_out_ref,
    'return_booking_id', v_ret_id,
    'return_reference', v_ret_ref,
    'carried_balance', v_carried,
    'combined_total', v_out_total + v_ret_subtotal
  );
end $$;

revoke execute on function public.create_booking from anon;

-- ---------------------------------------------------------------------------
-- Finding 2: record_payment with an ownership check and amount validation.
--
-- Unchanged from 0009 apart from the two blocks marked "0011". The ownership
-- rule is deliberately identical to the one cancel_booking already enforced —
-- agents act on their own bookings, admins on anything.
--
-- NOTE: if front-desk staff need to collect payment on bookings raised by a
-- different agent, relax the ownership block below rather than dropping it;
-- the overpayment check is independent and should stay either way.
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(
  p_booking_id uuid,
  p_amount numeric,
  p_method text,
  p_transaction_ref text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_b public.bookings;
  v_linked public.bookings;
  v_paid numeric;
  v_target numeric;
  v_balance numeric;
  v_src record;
begin
  perform set_config('app.rpc', 'on', true);

  if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_b.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;

  -- 0011 (finding 2): agents may record payments only against their own
  -- bookings. Previously any active staff member could post a payment to any
  -- booking in the system, which both confirmed unpaid bookings and inflated
  -- the acting agent's revenue in the by_agent report (received_by is set to
  -- the caller).
  if not public.is_admin() and v_b.created_by <> v_actor then
    raise exception 'NOT_ALLOWED';
  end if;

  -- round-trip rule: the single payment is recorded on the OUTBOUND leg.
  -- Outbound is identified by flight departure time: it departs before the
  -- return leg (create_booking enforces RETURN_BEFORE_OUTBOUND). A return
  -- leg whose outbound was cancelled stands alone and may be paid directly.
  if v_b.trip_type = 'round_trip' and v_b.linked_booking_id is not null then
    select * into v_linked from public.bookings
      where id = v_b.linked_booking_id for update;
    if v_linked.status <> 'cancelled'
       and (select departure_at from public.flights where id = v_linked.flight_id)
         < (select departure_at from public.flights where id = v_b.flight_id) then
      raise exception 'PAY_ON_OUTBOUND:%', v_linked.reference;
    end if;
  end if;

  -- 0011 (finding 2): the amount must be positive and must not exceed what the
  -- booking actually owes. p_amount was previously bounded only by the
  -- payments CHECK (amount > 0), so an arbitrarily large payment could be
  -- posted to distort total_revenue or manufacture a customer credit.
  -- booking_balances is pair-aware and already accounts for any carried
  -- balance, so this is the true outstanding figure.
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select coalesce(bb.balance, 0) into v_balance
    from public.booking_balances bb where bb.id = p_booking_id;

  if coalesce(v_balance, 0) <= 0 then
    raise exception 'NOTHING_OWED';
  end if;
  if p_amount > v_balance then
    raise exception 'OVERPAYMENT:%', v_balance;
  end if;

  insert into public.payments (booking_id, amount, method, transaction_ref, received_by)
  values (p_booking_id, p_amount, p_method, p_transaction_ref, v_actor);

  insert into public.booking_events (booking_id, actor_id, event, details)
  values (p_booking_id, v_actor, 'payment_recorded',
          jsonb_build_object('amount', p_amount, 'method', p_method,
                             'transaction_ref', p_transaction_ref));

  select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where booking_id = p_booking_id
       or (v_linked.id is not null and booking_id = v_linked.id);

  v_target := v_b.total_amount
            + case when v_linked.id is not null and v_linked.status <> 'cancelled'
                   then v_linked.total_amount else 0 end;

  if v_paid >= v_target and v_b.status = 'pending' then
    update public.bookings set status = 'confirmed' where id = v_b.id;
    insert into public.booking_events (booking_id, actor_id, event)
    values (v_b.id, v_actor, 'confirmed');

    if v_linked.id is not null and v_linked.status = 'pending' then
      update public.bookings set status = 'confirmed' where id = v_linked.id;
      insert into public.booking_events (booking_id, actor_id, event)
      values (v_linked.id, v_actor, 'confirmed');
    end if;

    -- old bookings whose unpaid balance was carried into this one are now
    -- settled too
    for v_src in
      select b2.id
      from public.balance_transfers t
      join public.bookings b2 on b2.id = t.from_booking_id
      where t.to_booking_id = v_b.id and t.voided_at is null and b2.status = 'pending'
    loop
      update public.bookings set status = 'confirmed' where id = v_src.id;
      insert into public.booking_events (booking_id, actor_id, event, details)
      values (v_src.id, v_actor, 'confirmed',
              jsonb_build_object('settled_via', v_b.reference));
    end loop;

    return jsonb_build_object('status', 'confirmed', 'paid', v_paid, 'target', v_target);
  end if;

  return jsonb_build_object('status', v_b.status, 'paid', v_paid, 'target', v_target);
end $$;

revoke execute on function public.record_payment from anon;
