-- =============================================================================
-- G-DIMENSION — Manual DB Hotfixes
-- =============================================================================
-- Track SQL fixes applied directly to the live DB outside the migration
-- sequence. Run each block once in the Supabase SQL Editor.
--
-- LIVE DB STATE
-- Last migration applied : 032_session_cost_breakdown.sql (2026-05-28)
-- All migrations 001–032 confirmed applied to production.
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

-- Migration 032: session cost breakdown columns (2026-05-28)
-- Run this in the Supabase SQL Editor after applying 032_session_cost_breakdown.sql.
-- Adds labor_cost and tax_amount to sessions for shop invoice breakdown.
-- (No additional grants needed — sessions was already granted in the block above.)
-- ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS labor_cost DECIMAL(10,2), ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2);

-- Fix RLS security vulnerability on reference tables (2026-05-28)
-- Supabase flagged 5 tables as publicly accessible (RLS disabled).
-- Without RLS, any anon-key request can INSERT/UPDATE/DELETE these tables.
-- These are lookup/reference tables — SELECT public, no writes allowed.
alter table public.part_categories         enable row level security;
alter table public.vehicle_makes           enable row level security;
alter table public.vehicle_models          enable row level security;
alter table public.vehicle_variants        enable row level security;
alter table public.vehicle_search_aliases  enable row level security;

create policy "part_categories_select_public"        on public.part_categories        for select using (true);
create policy "vehicle_makes_select_public"           on public.vehicle_makes           for select using (true);
create policy "vehicle_models_select_public"          on public.vehicle_models          for select using (true);
create policy "vehicle_variants_select_public"        on public.vehicle_variants        for select using (true);
create policy "vehicle_search_aliases_select_public"  on public.vehicle_search_aliases  for select using (true);

-- part_categories had no explicit SELECT grant (the others have grants in their
-- original migration files). Add it explicitly so it doesn't rely on legacy auto-grant.
grant select on public.part_categories to anon, authenticated;

-- Security hardening — lock down trigger functions (2026-05-31)
-- Supabase advisor flagged 12 trigger functions: 8 SECURITY DEFINER triggers +
-- rls_auto_enable (event trigger) were callable over /rest/v1/rpc/ by anon/
-- authenticated (default PUBLIC execute grant); 3 more had a mutable search_path.
-- The app makes zero .rpc() calls, so none should be API-exposed. Revoking EXECUTE
-- does NOT affect trigger firing (triggers run with table privileges, not caller's),
-- so signup/audit/timeline triggers are unaffected. Verified: all 12 warnings cleared.
revoke execute on function public.handle_new_user()                  from public;
revoke execute on function public.handle_timeline_entry()            from public;
revoke execute on function public.job_photos_set_car_id()            from public;
revoke execute on function public.job_specs_create_safety_reminder() from public;
revoke execute on function public.jobs_handle_removal()              from public;
revoke execute on function public.jobs_set_car_id()                  from public;
revoke execute on function public.receipts_set_car_id()              from public;
revoke execute on function public.write_audit_log()                  from public;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

alter function public.set_updated_at()              set search_path = public;
alter function public.prevent_origin_entry_delete() set search_path = public;
alter function public.job_specs_validate_value()    set search_path = public;
