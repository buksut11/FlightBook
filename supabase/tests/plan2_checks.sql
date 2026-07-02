-- impersonate the admin for auth.uid()
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'ADMIN-UUID', 'role', 'authenticated')::text,
  false
);

-- TEST 1: sold-out guard. Squeeze a flight to 1 economy seat, book 1, then book again.
update public.flights set seats_available_economy = 1
  where flight_number = 'GX101';

select public.create_booking(
  p_flight_id := (select id from public.flights where flight_number = 'GX101'),
  p_cabin_class := 'economy',
  p_passengers := '[{"full_name":"Test Pax One","passenger_type":"adult"}]'::jsonb,
  p_customer_name := 'Test Customer', p_customer_phone := '0700000001'
) as check_1a_booking_created;

-- this MUST fail with SOLD_OUT:GX101:0  (run separately; an exception aborts the tab)
-- select public.create_booking(
--   p_flight_id := (select id from public.flights where flight_number = 'GX101'),
--   p_cabin_class := 'economy',
--   p_passengers := '[{"full_name":"Test Pax Two"}]'::jsonb,
--   p_customer_name := 'Test Customer', p_customer_phone := '0700000001'
-- );

select seats_available_economy = 0 as check_1b_seats_zero
  from public.flights where flight_number = 'GX101';

-- TEST 2: round-trip atomicity. Return leg has 0 business seats available.
update public.flights set seats_available_business = 0
  where flight_number = 'GX102';

-- this MUST fail with SOLD_OUT:GX102:0 and change NOTHING (run separately):
-- select public.create_booking(
--   p_flight_id := (select id from public.flights where flight_number = 'GX103'),
--   p_cabin_class := 'economy',
--   p_passengers := '[{"full_name":"RT Pax"}]'::jsonb,
--   p_customer_name := 'RT Customer', p_customer_phone := '0700000002',
--   p_return_flight_id := (select id from public.flights where flight_number = 'GX102'),
--   p_return_cabin_class := 'business'
-- );

select seats_available_economy = 26 as check_2_outbound_untouched
  from public.flights where flight_number = 'GX103';

-- TEST 3: successful round trip + single payment confirms BOTH legs
select public.create_booking(
  p_flight_id := (select id from public.flights where flight_number = 'GX103'),
  p_cabin_class := 'economy',
  p_passengers := '[{"full_name":"RT Pax"}]'::jsonb,
  p_customer_name := 'RT Customer', p_customer_phone := '0700000002',
  p_return_flight_id := (select id from public.flights where flight_number = 'GX104'),
  p_return_cabin_class := 'economy'
) as check_3a_round_trip_created;

-- pay the combined total (120 + 120) on the outbound leg
select public.record_payment(
  p_booking_id := (
    select b.id from public.bookings b
    join public.flights f on f.id = b.flight_id
    where f.flight_number = 'GX103' and b.trip_type = 'round_trip'
    order by b.created_at desc limit 1
  ),
  p_amount := 240.00,
  p_method := 'evc_plus',
  p_transaction_ref := 'TEST-TXN-1'
) as check_3b_payment_result;  -- expect status: confirmed

select count(*) = 2 as check_3c_both_legs_confirmed
from public.bookings b
join public.flights f on f.id = b.flight_id
where f.flight_number in ('GX103','GX104')
  and b.trip_type = 'round_trip' and b.status = 'confirmed';

-- TEST 4: cancelling the pair restores seats on both flights
select public.cancel_booking(
  (select b.id from public.bookings b
   join public.flights f on f.id = b.flight_id
   where f.flight_number = 'GX103' and b.trip_type = 'round_trip'
   order by b.created_at desc limit 1),
  'pair'
) as check_4a_cancelled;

select
  (select seats_available_economy from public.flights where flight_number = 'GX103') = 26
  and
  (select seats_available_economy from public.flights where flight_number = 'GX104') = 26
  as check_4b_seats_restored;

-- TEST 5: audit trail exists
select count(*) >= 6 as check_5_events_logged from public.booking_events;

-- cleanup: reset squeezed flights
update public.flights set seats_available_economy = 26 where flight_number = 'GX101';
update public.flights set seats_available_business = 4 where flight_number = 'GX102';
