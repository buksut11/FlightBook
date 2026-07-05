-- Enable Supabase Realtime change events for the tables behind the
-- dashboard and report counts, so open pages can refresh instantly.
-- Safe to run more than once.
do $$
declare
  t text;
begin
  foreach t in array array['bookings', 'payments', 'flights'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
