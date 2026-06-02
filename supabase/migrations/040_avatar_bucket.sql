-- =============================================================================
-- G-DIMENSION — Migration 040: avatars storage bucket
-- =============================================================================
-- Adds the storage bucket behind users.avatar_url (profile pictures). This is
-- the 6th bucket. PUBLIC, like car-photos: the URL is embedded on public build
-- profiles, and RLS on the users table controls who can read the URL.
--
-- Uploads are always compressed to JPEG client-side (see CLAUDE.md), so the mime
-- allow-list permits the common image inputs but the app only ever writes jpeg.
--
-- Path pattern: {user_id}/{timestamp}-{random}.jpg
-- The first path segment is the owner's auth.uid(), which the RLS policies below
-- pin writes to — a user can only write under their own folder.
--
-- Run once in the Supabase SQL Editor. Idempotent.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,            -- Public bucket — avatar URLs appear on public profiles
  5242880,         -- 5MB limit (avatars are small after compression)
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage RLS: avatars ---------------------------------------------------------
-- Owner can upload to their own user_id folder.
create policy "avatars_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner can update their own avatars.
create policy "avatars_update_owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owner can delete their own avatars (we prune the previous file on replace).
create policy "avatars_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read — avatars are shown on public build profiles.
create policy "avatars_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'avatars');
