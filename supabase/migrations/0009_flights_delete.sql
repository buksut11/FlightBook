-- Allow admins to delete flights (used by the Delete button on the
-- Flights page). Flights that have bookings are still protected by the
-- bookings.flight_id foreign key and an app-level check.
drop policy if exists "admin delete flights" on public.flights;
create policy "admin delete flights" on public.flights
  for delete using (public.is_admin());
