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
               count(distinct b.id) as bookings,
               coalesce(sum(pay.amount), 0) as revenue
        from public.profiles pr
        left join public.bookings b
          on b.created_by = pr.id
          and b.created_at >= p_from and b.created_at < v_to_excl
          and b.status <> 'cancelled'
        left join public.payments pay
          on pay.received_by = pr.id
          and pay.received_at >= p_from and pay.received_at < v_to_excl
        group by pr.id, pr.full_name
        having count(distinct b.id) > 0 or coalesce(sum(pay.amount), 0) > 0
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
      select coalesce(sum(
        case when discount_type = 'percent' then subtotal * discount_value / 100.0
             when discount_type = 'fixed' then discount_value
             else 0 end), 0)
      from public.bookings
      where created_at >= p_from and created_at < v_to_excl and status <> 'cancelled'
    )
  ) into v_result;

  return v_result;
end $$;
