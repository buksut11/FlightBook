create or replace function public.generate_booking_reference()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  ref text;
  i int;
begin
  loop
    ref := 'TKT-';
    for i in 1..6 loop
      ref := ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where reference = ref);
  end loop;
  return ref;
end $$;

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
  v_is_round boolean := p_return_flight_id is not null;
  v_out record;
  v_ret record;
  v_out_price numeric;
  v_ret_price numeric := 0;
  v_out_subtotal numeric;
  v_ret_subtotal numeric := 0;
  v_discount numeric := 0;
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
    v_out_price := v_out.price_economy;
  else
    if v_out.price_business is null then
      raise exception 'NO_BUSINESS_CABIN:%', v_out.flight_number;
    end if;
    if v_out.seats_available_business < v_count then
      raise exception 'SOLD_OUT:%:%', v_out.flight_number, v_out.seats_available_business;
    end if;
    v_out_price := v_out.price_business;
  end if;

  if v_is_round then
    if p_return_cabin_class = 'economy' then
      if v_ret.seats_available_economy < v_count then
        raise exception 'SOLD_OUT:%:%', v_ret.flight_number, v_ret.seats_available_economy;
      end if;
      v_ret_price := v_ret.price_economy;
    else
      if v_ret.price_business is null then
        raise exception 'NO_BUSINESS_CABIN:%', v_ret.flight_number;
      end if;
      if v_ret.seats_available_business < v_count then
        raise exception 'SOLD_OUT:%:%', v_ret.flight_number, v_ret.seats_available_business;
      end if;
      v_ret_price := v_ret.price_business;
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

  -- money: discount + extra baggage live on the outbound leg
  v_out_subtotal := v_out_price * v_count;
  if v_is_round then v_ret_subtotal := v_ret_price * v_count; end if;

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

  v_out_ref := public.generate_booking_reference();
  insert into public.bookings (
    reference, flight_id, customer_id, created_by, cabin_class, passenger_count,
    trip_type, subtotal, discount_type, discount_value, discount_reason,
    extra_baggage_kg, extra_baggage_fee, total_amount, currency
  ) values (
    v_out_ref, p_flight_id, v_customer_id, v_agent, p_cabin_class, v_count,
    case when v_is_round then 'round_trip' else 'one_way' end,
    v_out_subtotal, p_discount_type, coalesce(p_discount_value, 0), p_discount_reason,
    coalesce(p_extra_baggage_kg, 0), coalesce(p_extra_baggage_fee, 0),
    v_out_total, v_out.currency
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
                             'discount', v_discount));
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
    'combined_total', v_out_total + v_ret_subtotal
  );
end $$;

revoke execute on function public.create_booking from anon;
