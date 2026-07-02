create table public.airports (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  city text not null,
  country text not null,
  created_at timestamptz not null default now()
);

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  registration text unique,
  seats_economy_default int not null check (seats_economy_default >= 0),
  seats_business_default int not null default 0 check (seats_business_default >= 0),
  created_at timestamptz not null default now()
);

create table public.flights (
  id uuid primary key default gen_random_uuid(),
  flight_number text not null,
  origin_airport_id uuid not null references public.airports(id),
  destination_airport_id uuid not null references public.airports(id),
  aircraft_id uuid references public.aircraft(id),
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  price_economy numeric(10,2) not null check (price_economy >= 0),
  price_business numeric(10,2) check (price_business >= 0),
  seats_total_economy int not null check (seats_total_economy >= 0),
  seats_available_economy int not null check (seats_available_economy >= 0),
  seats_total_business int not null default 0 check (seats_total_business >= 0),
  seats_available_business int not null default 0 check (seats_available_business >= 0),
  baggage_kg_economy int not null default 30,
  baggage_kg_business int not null default 40,
  currency text not null default 'USD',
  status text not null default 'scheduled' check (status in ('scheduled','departed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_airports check (origin_airport_id <> destination_airport_id),
  constraint arrival_after_departure check (arrival_at > departure_at)
);

create index flights_departure_idx on public.flights (departure_at);
create index flights_route_idx
  on public.flights (origin_airport_id, destination_airport_id, departure_at);

create trigger flights_updated_at
  before update on public.flights
  for each row execute function public.set_updated_at();

alter table public.airports enable row level security;
alter table public.aircraft enable row level security;
alter table public.flights enable row level security;

-- read: all active staff; write: admin only
create policy "staff read airports" on public.airports for select using (public.is_active_staff());
create policy "admin insert airports" on public.airports for insert with check (public.is_admin());
create policy "admin update airports" on public.airports for update using (public.is_admin());
create policy "admin delete airports" on public.airports for delete using (public.is_admin());

create policy "staff read aircraft" on public.aircraft for select using (public.is_active_staff());
create policy "admin insert aircraft" on public.aircraft for insert with check (public.is_admin());
create policy "admin update aircraft" on public.aircraft for update using (public.is_admin());
create policy "admin delete aircraft" on public.aircraft for delete using (public.is_admin());

create policy "staff read flights" on public.flights for select using (public.is_active_staff());
create policy "admin insert flights" on public.flights for insert with check (public.is_admin());
create policy "admin update flights" on public.flights for update using (public.is_admin());
-- no delete policy on flights: cancel via status
