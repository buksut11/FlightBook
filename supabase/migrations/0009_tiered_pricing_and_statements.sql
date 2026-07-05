-- Plan 9: tiered passenger pricing, carried-forward balances, and customer statements.
--
-- 1. Flights get optional child/infant fares per cabin (null = same as adult fare).
-- 2. Bookings record any previous unpaid balance rolled into their total
--    (carried_balance), with the per-source detail in balance_transfers.
-- 3. Views expose per-booking balances (booking_balances), a per-customer
--    transaction ledger (customer_statement_entries), and per-customer
--    financial summaries (customer_balances).

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

alter table public.flights
  add column price_economy_child   numeric(10,2) check (price_economy_child >= 0),
  add column price_economy_infant  numeric(10,2) check (price_economy_infant >= 0),
  add column price_business_child  numeric(10,2) check (price_business_child >= 0),
  add column price_business_infant numeric(10,2) check (price_business_infant >= 0);

alter table public.bookings
  add column carried_balance numeric(10,2) not null default 0 check (carried_balance >= 0);

-- One row per unpaid balance rolled from an old booking into a new one.
-- Voided rows (cancelled target booking) return the debt to the source booking.
create table public.balance_transfers (
  id uuid primary key default gen_random_uuid(),
  from_booking_id uuid not null references public.bookings(id),
  to_booking_id uuid not null references public.bookings(id),
  amount numeric(10,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  constraint different_bookings check (from_booking_id <> to_booking_id)
);
create index balance_transfers_from_idx on public.balance_transfers (from_booking_id);
create index balance_transfers_to_idx on public.balance_transfers (to_booking_id);

alter table public.balance_transfers enable row level security;
create policy "staff read transfers" on public.balance_transfers
  for select using (public.is_active_staff());
-- writes happen only inside the security definer RPCs below

-- carried_balance is money-bearing: only RPCs may change it.
create or replace function public.protect_booking_columns()
returns trigger language plpgsql as $$
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
     or new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'PROTECTED_COLUMNS: use the booking RPC functions';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Pricing helper: subtotal of one leg for a mix of adult/child/infant fares.
-- Child/infant fares fall back to the adult fare when not set on the flight.
-- ---------------------------------------------------------------------------

create or replace function public.leg_subtotal(
  f public.flights,
  p_cabin text,
  p_adults int,
  p_children int,
  p_infants int
) returns numeric language plpgsql as $$
declare
  v_adult numeric;
  v_child numeric;
  v_infant numeric;
begin
  if p_cabin = 'economy' then
    v_adult  := f.price_economy;
    v_child  := coalesce(f.price_economy_child, f.price_economy);
    v_infant := coalesce(f.price_economy_infant, f.price_economy);
  else
    v_adult  := f.price_business;
    v_child  := coalesce(f.price_business_child, f.price_business);
    v_infant := coalesce(f.price_business_infant, f.price_business);
  end if;
  return v_adult * p_adults + v_child * p_children + v_infant * p_infants;
end $$;

-- ---------------------------------------------------------------------------
-- booking_balances: what each booking still owes, pair-aware.
-- Return legs of an active round trip owe 0 (their fare is billed on the
-- outbound leg); the outbound leg owes both fares. Balances already rolled
-- into a newer booking (balance_transfers) no longer count against the source.
-- ---------------------------------------------------------------------------

create or replace view public.booking_balances
with (security_invoker = on) as
with base as (
  select
    b.id, b.customer_id, b.reference, b.status, b.currency, b.created_at,
    b.total_amount, b.carried_balance,
    (lb.id is not null and lf.departure_at < bf.departure_at) as is_return_leg,
    lb.id as linked_id, lb.status as linked_status, lb.total_amount as linked_total,
    coalesce((select sum(p.amount) from public.payments p where p.booking_id = b.id), 0) as own_paid,
    coalesce((select sum(p.amount) from public.payments p where p.booking_id = lb.id), 0) as linked_paid,
    coalesce((select sum(t.amount) from public.balance_transfers t
              where t.from_booking_id = b.id and t.voided_at is null), 0) as transferred_out
  from public.bookings b
  left join public.bookings lb on lb.id = b.linked_booking_id
  left join public.flights bf on bf.id = b.flight_id
  left join public.flights lf on lf.id = lb.flight_id
),
calc as (
  select *,
    case
      when status = 'cancelled' then 0::numeric
      when is_return_leg and linked_status <> 'cancelled' then 0::numeric
      else total_amount
           + case when not is_return_leg and linked_id is not null and linked_status <> 'cancelled'
                  then linked_total else 0::numeric end
    end as amount_due,
    case
      when status = 'cancelled' then 0::numeric
      when is_return_leg and linked_status <> 'cancelled' then 0::numeric
      else own_paid + linked_paid
    end as amount_paid
  from base
)
select
  id, customer_id, reference, status, currency, created_at,
  is_return_leg, carried_balance, amount_due, amount_paid, transferred_out,
  greatest(0, amount_due - amount_paid - transferred_out) as balance
from calc;

-- ---------------------------------------------------------------------------
-- customer_statement_entries: one row per financial event on a customer's
-- account. Debits are charges (booking totals, which include any carried
-- balance); credits are payments and balances carried forward to a newer
-- booking (so the same debt is never counted twice).
-- ---------------------------------------------------------------------------

create or replace view public.customer_statement_entries
with (security_invoker = on) as
select
  b.customer_id,
  b.created_at as entry_at,
  'charge'::text as entry_type,
  b.id as booking_id,
  b.reference,
  'Booking ' || b.reference
    || coalesce(' — flight ' || f.flight_number, '')
    || case when b.carried_balance > 0 then ' (includes previous balance)' else '' end
    as description,
  b.total_amount as debit,
  0::numeric as credit,
  b.currency
from public.bookings b
left join public.flights f on f.id = b.flight_id
where b.status <> 'cancelled'
union all
select
  b.customer_id,
  p.received_at,
  'payment',
  b.id,
  b.reference,
  'Payment via ' || replace(p.method, '_', ' ') || ' on ' || b.reference
    || case when b.status = 'cancelled' then ' (booking later cancelled)' else '' end,
  0::numeric,
  p.amount,
  b.currency
from public.payments p
join public.bookings b on b.id = p.booking_id
union all
select
  b.customer_id,
  t.created_at,
  'balance_carried',
  b.id,
  b.reference,
  'Balance of ' || b.reference || ' carried forward to ' || nb.reference,
  0::numeric,
  t.amount,
  b.currency
from public.balance_transfers t
join public.bookings b on b.id = t.from_booking_id
join public.bookings nb on nb.id = t.to_booking_id
where t.voided_at is null;

-- ---------------------------------------------------------------------------
-- customer_balances: per-customer financial summary.
--   total_charged  — genuine fares billed (carried amounts counted once)
--   total_paid     — money actually received
--   outstanding    — money still owed
-- ---------------------------------------------------------------------------

create or replace view public.customer_balances
with (security_invoker = on) as
select
  c.id as customer_id,
  c.full_name,
  c.phone,
  coalesce(sum(e.debit), 0)
    - coalesce(sum(e.credit) filter (where e.entry_type = 'balance_carried'), 0) as total_charged,
  coalesce(sum(e.credit) filter (where e.entry_type = 'payment'), 0) as total_paid,
  coalesce(sum(e.debit) - sum(e.credit), 0) as outstanding,
  max(e.currency) as currency
from public.customers c
left join public.customer_statement_entries e on e.customer_id = c.id
group by c.id, c.full_name, c.phone;

-- ---------------------------------------------------------------------------
-- create_booking: tiered fares per passenger type + carry any unpaid balance
-- from the customer's previous bookings into the new total.
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

  select
    count(*) filter (where coalesce(p->>'passenger_type', 'adult') = 'adult'),
    count(*) filter (where p->>'passenger_type' = 'child'),
    count(*) filter (where p->>'passenger_type' = 'infant')
  into v_adults, v_children, v_infants
  from jsonb_array_elements(p_passengers) p;

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
                               'reason', p_discount_reason));
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
-- cancel_booking: additionally return any carried-in debt to its source
-- bookings by voiding the transfers, so the old bookings owe again.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_scope text default 'leg'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_b public.bookings;
  v_linked public.bookings;
  v_returned numeric;
begin
  perform set_config('app.rpc', 'on', true);

  if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;
  if p_scope not in ('leg','pair') then raise exception 'INVALID_SCOPE:%', p_scope; end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_b.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;

  -- agents may cancel only their own pending bookings; admins anything
  if not public.is_admin() then
    if v_b.created_by <> v_actor or v_b.status <> 'pending' then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;

  -- lock flight rows (consistent order) before touching seats
  perform 1 from public.flights
    where id in (
      select flight_id from public.bookings
      where id = p_booking_id
         or (p_scope = 'pair' and id = v_b.linked_booking_id)
    )
    order by id for update;

  perform public.restore_seats(v_b);
  update public.bookings
    set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
    where id = v_b.id;
  insert into public.booking_events (booking_id, actor_id, event, details)
  values (v_b.id, v_actor, 'cancelled', jsonb_build_object('scope', p_scope));

  with voided as (
    update public.balance_transfers
       set voided_at = now(), voided_by = v_actor
     where to_booking_id = v_b.id and voided_at is null
     returning amount
  )
  select coalesce(sum(amount), 0) into v_returned from voided;
  if v_returned > 0 then
    insert into public.booking_events (booking_id, actor_id, event, details)
    values (v_b.id, v_actor, 'carried_balance_returned',
            jsonb_build_object('amount', v_returned));
  end if;

  if p_scope = 'pair' and v_b.linked_booking_id is not null then
    select * into v_linked from public.bookings
      where id = v_b.linked_booking_id for update;
    if found and v_linked.status <> 'cancelled' then
      perform public.restore_seats(v_linked);
      update public.bookings
        set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
        where id = v_linked.id;
      insert into public.booking_events (booking_id, actor_id, event, details)
      values (v_linked.id, v_actor, 'cancelled', jsonb_build_object('scope', 'pair'));

      with voided as (
        update public.balance_transfers
           set voided_at = now(), voided_by = v_actor
         where to_booking_id = v_linked.id and voided_at is null
         returning amount
      )
      select coalesce(sum(amount), 0) into v_returned from voided;
      if v_returned > 0 then
        insert into public.booking_events (booking_id, actor_id, event, details)
        values (v_linked.id, v_actor, 'carried_balance_returned',
                jsonb_build_object('amount', v_returned));
      end if;
    end if;
  end if;
end $$;

revoke execute on function public.cancel_booking from anon;

-- ---------------------------------------------------------------------------
-- record_payment: the target already includes any carried balance. When the
-- target is reached, also confirm the pending source bookings whose debt was
-- rolled into this one — their money is now settled here.
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
  v_src record;
begin
  perform set_config('app.rpc', 'on', true);

  if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_b.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;

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
