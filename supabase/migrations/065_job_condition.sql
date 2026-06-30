-- =============================================================================
-- G-DIMENSION — Migration 065: new/used condition on a mod/part
-- =============================================================================
-- Adds jobs.condition — whether the part was bought new or used. Nullable so
-- existing jobs stay unlabeled rather than being force-assigned. Surfaced as a
-- New/Used toggle on the Add/Edit mod forms and a small badge on the build sheet.
-- Additive nullable column. Idempotent.
-- =============================================================================

alter table public.jobs
  add column if not exists condition text
  check (condition in ('new', 'used'));
