create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_phone_idx on public.customers (phone);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  flight_id uuid not null references public.flights(id),
  customer_id uuid not null references public.customers(id),
  created_by uuid not null references public.profiles(id),
  cabin_class text not null check (cabin_class in ('economy','business')),
  passenger_count int not null check (passenger_count >= 1),
  trip_type text not null default 'one_way' check (trip_type in ('one_way','round_trip')),
  linked_booking_id uuid references public.bookings(id),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  discount_type text not null default 'none' check (discount_type in ('none','percent','fixed')),
  discount_value numeric(10,2) not null default 0 check (discount_value >= 0),
  discount_reason text,
  extra_baggage_kg int not null default 0 check (extra_baggage_kg >= 0),
  extra_baggage_fee numeric(10,2) not null default 0 check (extra_baggage_fee >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled')),
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_flight_idx on public.bookings (flight_id);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_status_idx on public.bookings (status);
create index bookings_created_at_idx on public.bookings (created_at);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  full_name text not null,
  id_number text,
  passenger_type text not null default 'adult'
    check (passenger_type in ('adult','child','infant')),
  created_at timestamptz not null default now()
);
create index passengers_booking_idx on public.passengers (booking_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  amount numeric(10,2) not null check (amount > 0),
  method text not null check (method in ('evc_plus','zaad','sahal','cash','other')),
  transaction_ref text,
  received_by uuid not null references public.profiles(id),
  received_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments (booking_id);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id),
  actor_id uuid references public.profiles(id),
  event text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id);

-- Protection: financial/status columns of bookings may only change inside an RPC.
-- RPCs set: perform set_config('app.rpc', 'on', true);  (transaction-local)
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
     or new.linked_booking_id is distinct from old.linked_booking_id
     or new.cancelled_by is distinct from old.cancelled_by
     or new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'PROTECTED_COLUMNS: use the booking RPC functions';
  end if;
  return new;
end $$;

create trigger bookings_protect
  before update on public.bookings
  for each row execute function public.protect_booking_columns();

alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.passengers enable row level security;
alter table public.payments enable row level security;
alter table public.booking_events enable row level security;

create policy "staff read customers" on public.customers for select using (public.is_active_staff());
create policy "staff insert customers" on public.customers for insert with check (public.is_active_staff());
create policy "staff update customers" on public.customers for update using (public.is_active_staff());

create policy "staff read bookings" on public.bookings for select using (public.is_active_staff());
-- no insert policy: create_booking RPC only (security definer bypasses RLS)
-- update limited to non-protected columns (trigger enforces), own pending or admin:
create policy "edit own pending or admin" on public.bookings for update
  using (
    public.is_admin()
    or (created_by = auth.uid() and status = 'pending' and public.is_active_staff())
  );

create policy "staff read passengers" on public.passengers for select using (public.is_active_staff());
create policy "edit passengers of editable bookings" on public.passengers for update
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id
      and (public.is_admin() or (b.created_by = auth.uid() and b.status = 'pending'))
  ));

create policy "staff read payments" on public.payments for select using (public.is_active_staff());
-- payments: insert via RPC only, immutable after

create policy "staff read events" on public.booking_events for select using (public.is_active_staff());
