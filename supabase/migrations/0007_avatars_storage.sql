-- Anyone authenticated can read (bucket is public anyway); users write only their own folder.
create policy "avatars are readable by staff"
  on storage.objects for select
  using (bucket_id = 'avatars' and public.is_active_staff());

create policy "users write their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and public.is_active_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
