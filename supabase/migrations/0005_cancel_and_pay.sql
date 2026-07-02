-- helper: restore seats for one booking row (assumes its flight row is locked)
create or replace function public.restore_seats(b public.bookings)
returns void language plpgsql as $$
begin
  if b.cabin_class = 'economy' then
    update public.flights
      set seats_available_economy = least(seats_total_economy,
                                          seats_available_economy + b.passenger_count)
      where id = b.flight_id;
  else
    update public.flights
      set seats_available_business = least(seats_total_business,
                                           seats_available_business + b.passenger_count)
      where id = b.flight_id;
  end if;
end $$;

create or replace function public.cancel_booking(
  p_booking_id uuid,
  p_scope text default 'leg'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_b public.bookings;
  v_linked public.bookings;
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
    end if;
  end if;
end $$;

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
begin
  perform set_config('app.rpc', 'on', true);

  if not public.is_active_staff() then raise exception 'NOT_STAFF'; end if;

  select * into v_b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_b.status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;

  -- round-trip rule: the single payment is recorded on the OUTBOUND leg.
  -- Outbound is identified by flight departure time: it departs before the
  -- return leg (create_booking enforces RETURN_BEFORE_OUTBOUND).
  if v_b.trip_type = 'round_trip' and v_b.linked_booking_id is not null then
    select * into v_linked from public.bookings
      where id = v_b.linked_booking_id for update;
    if (select departure_at from public.flights where id = v_linked.flight_id)
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
    from public.payments where booking_id = p_booking_id;

  v_target := v_b.total_amount + coalesce(v_linked.total_amount, 0);

  if v_paid >= v_target and v_b.status = 'pending' then
    update public.bookings set status = 'confirmed' where id = v_b.id;
    insert into public.booking_events (booking_id, actor_id, event)
    values (v_b.id, v_actor, 'confirmed');

    if v_linked.id is not null and v_linked.status = 'pending' then
      update public.bookings set status = 'confirmed' where id = v_linked.id;
      insert into public.booking_events (booking_id, actor_id, event)
      values (v_linked.id, v_actor, 'confirmed');
    end if;
    return jsonb_build_object('status', 'confirmed', 'paid', v_paid, 'target', v_target);
  end if;

  return jsonb_build_object('status', v_b.status, 'paid', v_paid, 'target', v_target);
end $$;

revoke execute on function public.cancel_booking from anon;
revoke execute on function public.record_payment from anon;
