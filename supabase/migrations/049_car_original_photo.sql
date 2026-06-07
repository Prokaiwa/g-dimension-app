-- 049_car_original_photo.sql
-- Persist the ORIGINAL uploaded car photo (before background removal).
--
-- Until now only the background-removed cutout is stored (cars.garage_photo_url);
-- the original is decoded in the browser and then discarded. Keeping the original
-- lets us (a) show the full, un-stripped photo on the Featured magazine cover,
-- (b) re-run background removal later (e.g. moving to BiRefNet on-device — see
-- CAR_PHOTO_HANDOFF.md), and (c) never destroy the user's source image.
--
-- Additive, nullable column on an existing RLS-protected table — no policy or
-- grant changes needed (the existing cars RLS already governs it). Existing cars
-- stay NULL until the owner re-uploads that car's photo. The original is stored
-- as a compressed JPEG in the existing public car-photos bucket, path
-- {userId}/{carId}/original-{ts}.jpg (garage_photo_url remains the PNG cutout).

alter table public.cars
  add column if not exists original_photo_url text;

comment on column public.cars.original_photo_url is
  'Original uploaded car photo (compressed JPEG, in the car-photos bucket) before background removal. garage_photo_url is the cutout derived from it. Nullable; backfilled only on re-upload.';

-- Reload the PostgREST schema cache so the new column is queryable immediately.
notify pgrst, 'reload schema';
