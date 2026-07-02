-- profiles: one row per staff member, mirrors auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin', 'agent')),
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- role helpers used by all RLS policies project-wide
create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;

create policy "staff can read profiles"
  on public.profiles for select
  using (public.is_active_staff());

create policy "admin can insert profiles"
  on public.profiles for insert
  with check (public.is_admin());

create policy "own row or admin can update"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (
    -- non-admins cannot change role or is_active on their own row
    public.is_admin()
    or (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid())
        and is_active = true)
  );
-- no delete policy: profiles are deactivated, never deleted
