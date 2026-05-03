-- =============================================================================
-- G-DIMENSION — Storage Bucket Configuration
-- =============================================================================
-- Supabase Storage setup for all file upload categories.
-- Run via Supabase dashboard → Storage → New Bucket, OR via the Management API.
-- This SQL uses the storage schema functions available in Supabase.
--
-- BUCKET STRATEGY:
--   4 buckets, each with a distinct access model and file type restriction.
--   Bucket names use kebab-case (Supabase convention).
--
-- NAMING:
--   car-photos     → garage hero + showcase photos (per car)
--   job-photos     → modification, service, detail session photos
--   receipts       → financial documents (images + PDFs)
--   timeline-photos → hero photos for Timeline cards + Origin Entry photo
--
-- Note: car_documents uploads (registration, insurance PDFs) go in
-- car-documents bucket (added below). Originally the architecture didn't
-- specify a separate bucket for documents but they require stricter access
-- controls than car photos and should be isolated.
-- =============================================================================


-- =============================================================================
-- BUCKET 1: car-photos
-- Stores: cars.garage_photo_url, cars.showcase_photo_url
-- Access: PUBLIC — car photos are shown on public profiles when is_public=true
--         The URL is stored in the cars table. RLS on the cars table controls
--         who can query the URL. The photo itself is publicly accessible by URL.
-- File types: image only (JPEG, PNG, WebP, HEIC)
-- Max size: 10MB per file (Remove.bg input limit consideration)
-- Path pattern: {user_id}/{car_id}/garage.jpg
--               {user_id}/{car_id}/showcase.jpg
--               {user_id}/{car_id}/garage_rembg.jpg (background-removed)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-photos',
  'car-photos',
  true,             -- Public bucket — photo URLs are embedded in public profiles
  10485760,         -- 10MB limit
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

-- Storage RLS: car-photos
-- Authenticated users can upload to their own user_id path
create policy "car_photos_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated owners can update and delete their own photos
create policy "car_photos_update_owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "car_photos_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'car-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read (bucket is public — this policy is for non-public buckets if ever changed)
create policy "car_photos_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'car-photos');


-- =============================================================================
-- BUCKET 2: job-photos
-- Stores: job_photos.photo_url
-- Access: PUBLIC — photos shown in public build profiles
-- File types: image only
-- Max size: 20MB per file (allow higher quality build photos)
-- Path pattern: {user_id}/{car_id}/{session_id}/{job_id}/{uuid}.jpg
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  20971520,         -- 20MB limit — build photos deserve quality
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

create policy "job_photos_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "job_photos_update_owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "job_photos_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "job_photos_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'job-photos');


-- =============================================================================
-- BUCKET 3: receipts
-- Stores: receipts.file_url
-- Access: PRIVATE — financial documents are never publicly accessible.
--         Authenticated owners only. The bucket is private; URLs require
--         a signed URL generated server-side (Supabase createSignedUrl).
-- File types: image + PDF
-- Max size: 20MB per file (PDF invoices can be large)
-- Path pattern: {user_id}/{car_id}/{session_id}/{uuid}.pdf
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,            -- PRIVATE — financial data
  20971520,         -- 20MB
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "receipts_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_select_owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- NO anon SELECT policy — receipts are never public.


-- =============================================================================
-- BUCKET 4: timeline-photos
-- Stores: sessions.timeline_photo_url, timeline_entries.photo_url (Origin Entry)
-- Access: PUBLIC — Timeline is visible on public profiles
-- File types: image only
-- Max size: 15MB
-- Path pattern: {user_id}/{car_id}/origin.jpg
--               {user_id}/{car_id}/{session_id}/hero.jpg
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'timeline-photos',
  'timeline-photos',
  true,
  15728640,         -- 15MB
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

create policy "timeline_photos_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'timeline-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "timeline_photos_update_owner"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'timeline-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "timeline_photos_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'timeline-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "timeline_photos_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'timeline-photos');


-- =============================================================================
-- BUCKET 5: car-documents (added — not in original architecture)
-- Stores: car_documents.file_url
-- Access: PRIVATE — registration, insurance, VIN documents are PII.
--         Same access model as receipts. Signed URLs only.
-- File types: image + PDF
-- Max size: 20MB
-- Path pattern: {user_id}/{car_id}/documents/{doc_type}/{uuid}.pdf
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-documents',
  'car-documents',
  false,            -- PRIVATE — identity documents (registration, title, insurance)
  20971520,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "car_documents_insert_owner"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'car-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "car_documents_select_owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'car-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "car_documents_delete_owner"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'car-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- =============================================================================
-- BUCKET SUMMARY
-- =============================================================================
-- Bucket           | Public | Types           | Max Size | Notes
-- car-photos       | YES    | images          | 10MB     | Garage hero, showcase
-- job-photos       | YES    | images          | 20MB     | All job/session photos
-- receipts         | NO     | images + PDF    | 20MB     | Financial docs (signed URL)
-- timeline-photos  | YES    | images          | 15MB     | Timeline hero + origin
-- car-documents    | NO     | images + PDF    | 20MB     | Reg, insurance (signed URL)
-- =============================================================================
