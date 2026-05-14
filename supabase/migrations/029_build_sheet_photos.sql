-- =============================================================================
-- G-DIMENSION — Migration 029: build sheet section photos on cars
-- =============================================================================
-- Adds four nullable photo URL columns to cars — one per build sheet group.
-- These are set by the owner from mod detail pages and displayed as hero
-- images next to each section on the build sheet.
-- =============================================================================

alter table public.cars
  add column if not exists build_sheet_power_photo    text,
  add column if not exists build_sheet_chassis_photo  text,
  add column if not exists build_sheet_exterior_photo text,
  add column if not exists build_sheet_interior_photo text;
