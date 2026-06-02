-- =============================================================================
-- G-DIMENSION — Migration 041: reminder lead time + job install mileage
-- =============================================================================
-- Two unrelated additive columns.
--
-- 1. car_reminders.remind_days_before — how far ahead of due_date to start
--    alerting (and, later, to fire a notification). The reminder's due_date is
--    the real deadline (e.g. a registration's expiry); remind_days_before just
--    controls when it lights up "soon". Replaces the old behaviour where the
--    document reminder's due_date was set to expiry-minus-leadtime, which made
--    it read as overdue for the whole lead-in window.
--
-- 2. jobs.install_mileage — odometer reading when a mod/part was installed
--    (e.g. "installed at 85,000 mi"). Optional. Also used to offer to bump
--    cars.current_mileage so the odometer stays fresh without manual edits.
--
-- Additive, non-destructive. Both tables already have RLS + grants.
-- =============================================================================

alter table public.car_reminders
  add column if not exists remind_days_before integer;

comment on column public.car_reminders.remind_days_before is
  'Lead time in days before due_date to start alerting / notify. NULL = use the default soon-threshold.';

alter table public.jobs
  add column if not exists install_mileage integer;

comment on column public.jobs.install_mileage is
  'Odometer (miles) when the mod/part was installed. Optional. Feeds the "update current mileage" prompt.';
