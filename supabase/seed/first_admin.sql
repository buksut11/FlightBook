-- First admin bootstrap (manual, one-time).
--
-- 1. Supabase Dashboard -> Authentication -> Users -> "Add user":
--    enter email + password and check "Auto Confirm User".
-- 2. Copy the new user's UUID.
-- 3. Replace the UUID and name below with the real values, then run this
--    in the Dashboard SQL Editor.

insert into public.profiles (id, full_name, role)
values ('PASTE-AUTH-USER-UUID-HERE', 'Admin Name', 'admin');
