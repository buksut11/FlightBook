-- Reporting fixes for the dashboard and the admin report.
--
-- Run this whole file in the Supabase Dashboard SQL Editor. It is
-- self-sufficient: it (re)creates both reporting functions, so it also
-- repairs projects where 0006_reporting.sql was never applied (the app
-- then rendered $0.00 / 0 everywhere because the RPCs did not exist).
--
-- Fixes over 0006:
-- 1. by_agent revenue was multiplied by the agent's booking count: the
--    single query left-joined bookings AND payments onto profiles, so an
--    agent with 3 bookings and 2 payments produced 6 rows and each payment
--    was summed 3 times. Bookings and payments are now aggregated
--    separately before joining.
-- 2. discounts_total recomputed percent discounts from the outbound leg's
--    subtotal only, under-reporting round trips (the discount is applied
--    to both legs but stored on the outbound booking). The actual applied
--    discount is now derived from what the booking charges:
--    subtotal + extra_baggage_fee + carried_balance - total_amount.
--    (carried_balance exists from 0009; it defaults to 0 on older rows.)

-- Today's snapshot for the dashboard.
create or replace function public.dashboard_summary()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_today date := current_date;
  v_result jsonb;
begin
  if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;

  select jsonb_build_object(
    'today_bookings', (
      select count(*) from public.bookings
      where created_at >= v_today and created_at < v_today + 1
        and status <> 'cancelled'
    ),
    'today_revenue', (
      select coalesce(sum(amount), 0) from public.payments
      where received_at >= v_today and received_at < v_today + 1
    ),
    'pending_count', (
      select count(*) from public.bookings where status = 'pending'
    ),
    'today_flights', (
      select coalesce(jsonb_agg(row_to_json(f) order by f.departure_at), '[]'::jsonb)
      from (
        select fl.flight_number, fl.departure_at,
               fl.seats_available_economy, fl.seats_total_economy,
               fl.seats_available_business, fl.seats_total_business,
               o.code as origin, d.code as destination
        from public.flights fl
        join public.airports o on o.id = fl.origin_airport_id
        join public.airports d on d.id = fl.destination_airport_id
        where fl.departure_at >= v_today and fl.departure_at < v_today + 1
          and fl.status = 'scheduled'
      ) f
    )
  ) into v_result;

  return v_result;
end $$;

-- Date-range report for admins.
create or replace function public.report_summary(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_to_excl date := p_to + 1;
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select jsonb_build_object(
    'total_revenue', (
      select coalesce(sum(amount), 0) from public.payments
      where received_at >= p_from and received_at < v_to_excl
    ),
    'bookings_count', (
      select count(*) from public.bookings
      where created_at >= p_from and created_at < v_to_excl and status <> 'cancelled'
    ),
    'by_agent', (
      select coalesce(jsonb_agg(row_to_json(a) order by a.revenue desc), '[]'::jsonb)
      from (
        select pr.full_name as agent,
               coalesce(b.bookings, 0) as bookings,
               coalesce(pay.revenue, 0) as revenue
        from public.profiles pr
        left join (
          select created_by, count(*) as bookings
          from public.bookings
          where created_at >= p_from and created_at < v_to_excl
            and status <> 'cancelled'
          group by created_by
        ) b on b.created_by = pr.id
        left join (
          select received_by, sum(amount) as revenue
          from public.payments
          where received_at >= p_from and received_at < v_to_excl
          group by received_by
        ) pay on pay.received_by = pr.id
        where coalesce(b.bookings, 0) > 0 or coalesce(pay.revenue, 0) > 0
      ) a
    ),
    'by_method', (
      select coalesce(jsonb_agg(row_to_json(m) order by m.total desc), '[]'::jsonb)
      from (
        select method, count(*) as count, coalesce(sum(amount), 0) as total
        from public.payments
        where received_at >= p_from and received_at < v_to_excl
        group by method
      ) m
    ),
    'discounts_total', (
      -- total_amount = subtotal - discount + extra_baggage_fee
      --                (+ carried_balance since 0009), clamped at 0,
      -- so the discount actually applied to each booking is:
      select coalesce(sum(greatest(0,
        subtotal + extra_baggage_fee
        + coalesce(to_jsonb(b)->>'carried_balance', '0')::numeric
        - total_amount)), 0)
      from public.bookings b
      where created_at >= p_from and created_at < v_to_excl
        and status <> 'cancelled'
        and discount_type <> 'none'
    )
  ) into v_result;

  return v_result;
end $$;
