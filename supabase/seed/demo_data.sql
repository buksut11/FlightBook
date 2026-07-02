insert into public.airports (code, name, city, country) values
  ('GGR', 'Garowe International Airport', 'Garowe', 'Somalia'),
  ('MGQ', 'Aden Adde International Airport', 'Mogadishu', 'Somalia'),
  ('HGA', 'Hargeisa Egal International Airport', 'Hargeisa', 'Somalia'),
  ('BSA', 'Bosaso International Airport', 'Bosaso', 'Somalia');

insert into public.aircraft (model, registration, seats_economy_default, seats_business_default) values
  ('Embraer E120', '6O-AAA', 26, 4),
  ('Fokker 50', '6O-BBB', 46, 0);

insert into public.flights (
  flight_number, origin_airport_id, destination_airport_id, aircraft_id,
  departure_at, arrival_at, price_economy, price_business,
  seats_total_economy, seats_available_economy,
  seats_total_business, seats_available_business
)
select
  'GX10' || row_number() over (),
  o.id, d.id, a.id,
  now() + (row_number() over ()) * interval '1 day' + interval '8 hours',
  now() + (row_number() over ()) * interval '1 day' + interval '9 hours 30 minutes',
  120.00, 200.00, 26, 26, 4, 4
from (values ('GGR','MGQ'), ('MGQ','GGR'), ('GGR','BSA'), ('BSA','GGR')) r(origin, dest)
join public.airports o on o.code = r.origin
join public.airports d on d.code = r.dest
cross join lateral (select id from public.aircraft where registration = '6O-AAA') a;
