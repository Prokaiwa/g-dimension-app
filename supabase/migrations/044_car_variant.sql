-- =============================================================================
-- G-DIMENSION — Migration 044: car sub-model / variant label
-- =============================================================================
-- Free-text variant/sub-model on a car, distinct from model and trim:
--   model   = canonical family from vehicle_models  (e.g. "LS")   — good for rollup
--   variant = the generation/displacement enthusiasts mean (e.g. "430") — NEW
--   trim    = spec level (e.g. "Sport", "F Sport")  — existing column
--
-- Display name becomes: year + model + variant  ->  "2006 LS 430".
--
-- This is the lightweight, ship-now form. It is intentionally forward-compatible
-- with the (currently empty) vehicle_variants catalog + cars.variant_id FK: when
-- that catalog is seeded, these free-text values can be matched/migrated into a
-- proper variant_id link and a Make->Model->Variant picker.
--
-- Additive, non-destructive. cars already has RLS + grants. Idempotent.
-- =============================================================================

alter table public.cars
  add column if not exists variant text;

comment on column public.cars.variant is
  'Free-text sub-model / variant label (e.g. "430" on a Lexus LS, "Type R" on a Civic). '
  'Distinct from model (family) and trim (spec level). Shown in the display name as '
  'year + model + variant. Forward-compatible with the vehicle_variants catalog + variant_id.';
