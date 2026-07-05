-- Removes all demo/test data so real data can be entered fresh.
-- KEEPS: staff accounts (profiles), airports, and aircraft.
-- DELETES: all bookings, payments, passengers, booking history,
--          customers, and flights.
--
-- Run once in the Supabase Dashboard SQL Editor.

begin;

delete from public.payments;
delete from public.balance_transfers;
delete from public.booking_events;
delete from public.passengers;
delete from public.bookings;
delete from public.customers;
delete from public.flights;

commit;

-- OPTIONAL: the demo airports and aircraft are real-looking entries
-- (Garowe, Mogadishu, Hargeisa, Bosaso + two aircraft). If you want to
-- remove them too and enter your own in Settings, remove the leading
-- "-- " from the four lines below and run again.
-- begin;
-- delete from public.aircraft;
-- delete from public.airports;
-- commit;
