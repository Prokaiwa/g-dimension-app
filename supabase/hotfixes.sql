-- =============================================================================
-- G-DIMENSION — Manual DB Hotfixes
-- =============================================================================
-- Track SQL fixes applied directly to the live DB outside the migration
-- sequence. Run each block once in the Supabase SQL Editor.
--
-- LIVE DB STATE
-- Last migration applied : 031_job_links.sql (2026-05-26)
-- All migrations 001–031 confirmed applied to production.
-- =============================================================================

-- Fix missing grants on job_specs (2026-05-14)
-- 024_part_spec_system.sql created job_specs but omitted the DML grants.
-- part_types and spec_templates are admin-managed lookup data — SELECT-only is correct.
grant select, insert, update, delete on public.job_specs to authenticated;

-- Fix durometer spec unit and placeholder (2026-05-15)
-- Migration 026 set unit=null and placeholder='75' for all durometer specs.
-- Changed to unit='A' (how aftermarket brands label it) and placeholder=null
-- since the help_text already provides enough context.
update spec_templates
set unit = 'A',
    placeholder = null
where spec_key = 'durometer';

-- Fix missing DML grants on core user tables (2026-05-16)
-- jobs, job_photos, car_reminders, and cars were missing UPDATE/DELETE grants for
-- authenticated. SELECT/INSERT worked via Supabase default setup but UPDATE (e.g.
-- removing a mod, "Put Back" in Parts Bin) and DELETE returned 400. The
-- jobs_handle_removal trigger also INSERTs into jobs — covered by this grant.
grant select, insert, update, delete on public.jobs        to authenticated;
grant select, insert, update, delete on public.job_photos  to authenticated;
grant select, insert, update, delete on public.cars        to authenticated;
grant select, insert, update, delete on public.car_reminders to authenticated;
grant select, insert, update, delete on public.sessions    to authenticated;

-- Fix jobs_handle_removal trigger — two-phase fix (2026-05-17)
-- Phase 1: Migration 024 added is_custom_spec to the trigger INSERT. Migration 025
-- dropped that column without updating the trigger, causing a 400 on Move to Storage.
-- Phase 2: The trigger was also creating a ghost duplicate (status='purchased',
-- still_owned=false) that was invisible in the UI but polluted the DB. The original
-- 'removed' row already appears in Parts Bin "In Storage" via the UI query, making
-- the trigger INSERT redundant. Made the function a no-op and deleted the ghost row
-- created during testing (job id 25961923-8b73-4978-9153-a7e8996ba292).
create or replace function public.jobs_handle_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

delete from public.job_specs where job_id = '25961923-8b73-4978-9153-a7e8996ba292';
delete from public.jobs      where id     = '25961923-8b73-4978-9153-a7e8996ba292';
