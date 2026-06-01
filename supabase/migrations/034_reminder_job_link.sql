-- =============================================================================
-- G-DIMENSION — Migration 034: car_reminders.job_id
-- =============================================================================
-- Lets a reminder attach to a specific part/mod (a `jobs` row), not just the
-- car as a whole. The driving use case is service intervals on wear/racing
-- parts: "rebuild the turbo every 30k mi", "replace the clutch", "re-pack the
-- race muffler". These pair naturally with the existing due_mileage column
-- (mileage-based trigger) and/or due_date.
--
-- on delete set null: if the part is deleted, the reminder survives but loses
-- its part link — same pattern as the existing document_id reference.
-- =============================================================================

alter table public.car_reminders
  add column if not exists job_id uuid references public.jobs(id) on delete set null;

comment on column public.car_reminders.job_id is
  'Optional link to a jobs row (part/mod). Used for part-level service-interval reminders (e.g. turbo rebuild every 30k mi). Pairs with due_mileage / due_date.';

-- Active reminders for a given part (part detail page lookup)
create index if not exists car_reminders_job_id
  on public.car_reminders (job_id)
  where job_id is not null and is_complete = false;

-- Table already has RLS (policy car_reminders_all_owner) and authenticated
-- grants from 010_014 + hotfixes — adding a column needs neither re-granted.
