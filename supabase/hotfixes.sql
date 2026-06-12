-- =============================================================================
-- G-DIMENSION — Manual DB Hotfixes
-- =============================================================================
-- Track SQL fixes applied directly to the live DB outside the migration
-- sequence. Run each block once in the Supabase SQL Editor.
--
-- LIVE DB STATE
-- Last migration applied : 052_featured_cover_story.sql (2026-06-12)
-- Migrations 001–052 applied to production, with corrections:
--   - 049 (cars.original_photo_url — persist the original car upload before
--     background removal) applied 2026-06-07, while building the Featured magazine.
--   - 033_session_mod_groups (sessions.title) had been SKIPPED on production.
--     Confirmed missing 2026-06-05 via an information_schema audit (the live DB
--     raised `42703 column sessions.title does not exist`). Re-applied as part
--     of 045 on 2026-06-05.
--   - 041 was applied 2026-06-03, out of order (after 042/043).
--   - 045 (timeline sync fix incl. the 033 re-add), 046 (note entries), and
--     047 (timeline_entry_photos / _links) were all applied 2026-06-05, and
--     048 (sessions.timeline_title + trigger title copy) on 2026-06-06, while
--     building the Timeline destination.
-- Schema audit 2026-06-05: every column/table object for 024–044 present except
-- 033 (now fixed); avatars bucket present; car_contacts correctly dropped.
-- The earlier "001–044 all applied" claim was WRONG (033 had slipped) — do not
-- assume a migration ran just because the watermark says so; verify against the
-- live schema when in doubt.
-- =============================================================================

-- 050: Allow cars.nickname to be NULL (2026-06-09)
-- Column was NOT NULL but UX allows leaving it blank; Featured falls back to model name.
alter table public.cars alter column nickname drop not null;

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

-- Fix missing DML grants on car_documents + receipts (2026-06-01)
-- The 2026-05-16 grant block covered jobs/job_photos/cars/car_reminders/sessions
-- but missed car_documents and receipts. Adding/editing/deleting documents — and
-- the new standalone receipts (which are car_documents rows, doc_type='receipt')
-- — failed silently. The Documents → Receipts tab also reads public.receipts and
-- needs SELECT. Grant full DML to both for consistency with the other user tables.
grant select, insert, update, delete on public.car_documents to authenticated;
grant select, insert, update, delete on public.receipts      to authenticated;

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

-- Performance — RLS InitPlan optimization (2026-05-31)
-- 18 RLS policies called auth.uid() directly, so Postgres re-evaluated it once
-- PER ROW. Wrapping as (select auth.uid()) makes it a one-time InitPlan constant
-- (evaluated once per query). Logic identical; used ALTER POLICY so cmd/roles are
-- untouched. Atomic via transaction. Verified: all 18 InitPlan warnings cleared.
begin;
alter policy "analytics_events_insert_authenticated" on public.analytics_events
  with check ((((select auth.uid()) = user_id) or (user_id is null)));
alter policy "audit_log_select_owner" on public.audit_log
  using (((select auth.uid()) = user_id));
alter policy "car_contacts_all_owner" on public.car_contacts
  using (exists (select 1 from public.cars where cars.id = car_contacts.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = car_contacts.car_id and cars.user_id = (select auth.uid())));
alter policy "car_documents_all_owner" on public.car_documents
  using (exists (select 1 from public.cars where cars.id = car_documents.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = car_documents.car_id and cars.user_id = (select auth.uid())));
alter policy "car_reminders_all_owner" on public.car_reminders
  using (exists (select 1 from public.cars where cars.id = car_reminders.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = car_reminders.car_id and cars.user_id = (select auth.uid())));
alter policy "cars_all_owner" on public.cars
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "error_logs_insert_authenticated" on public.error_logs
  with check ((((select auth.uid()) = user_id) or (user_id is null)));
alter policy "error_logs_select_owner" on public.error_logs
  using (((select auth.uid()) = user_id));
alter policy "Users manage own job links" on public.job_links
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));
alter policy "job_photos_all_owner" on public.job_photos
  using (exists (select 1 from public.cars where cars.id = job_photos.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = job_photos.car_id and cars.user_id = (select auth.uid())));
alter policy "job_specs_all_owner" on public.job_specs
  using (exists (select 1 from public.jobs j join public.cars c on c.id = j.car_id where j.id = job_specs.job_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.jobs j join public.cars c on c.id = j.car_id where j.id = job_specs.job_id and c.user_id = (select auth.uid())));
alter policy "jobs_all_owner" on public.jobs
  using (exists (select 1 from public.cars where cars.id = jobs.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = jobs.car_id and cars.user_id = (select auth.uid())));
alter policy "notification_preferences_all_owner" on public.notification_preferences
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
alter policy "receipts_all_owner" on public.receipts
  using (exists (select 1 from public.cars where cars.id = receipts.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = receipts.car_id and cars.user_id = (select auth.uid())));
alter policy "sessions_all_owner" on public.sessions
  using (exists (select 1 from public.cars where cars.id = sessions.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = sessions.car_id and cars.user_id = (select auth.uid())));
alter policy "timeline_entries_all_owner" on public.timeline_entries
  using (exists (select 1 from public.cars where cars.id = timeline_entries.car_id and cars.user_id = (select auth.uid())))
  with check (exists (select 1 from public.cars where cars.id = timeline_entries.car_id and cars.user_id = (select auth.uid())));
alter policy "user_flags_select_owner" on public.user_flags
  using (((select auth.uid()) = user_id));
alter policy "users_all_owner" on public.users
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));
commit;

-- Security — stop public buckets from being enumerable (2026-06-03)
-- The 4 public buckets (car-photos, job-photos, timeline-photos, avatars) each had
-- a broad SELECT policy on storage.objects that let anon/authenticated LIST every
-- file. Public object URLs (/object/public/) bypass RLS, so image display is
-- unaffected — this only removes enumeration. App makes no storage .list() calls.
-- Also wraps auth.uid() in the avatar write policies (040) to match the
-- InitPlan-optimized pattern. Verified: bucket-listing advisor warnings cleared.
begin;
drop policy if exists "car_photos_select_public"      on storage.objects;
drop policy if exists "job_photos_select_public"      on storage.objects;
drop policy if exists "timeline_photos_select_public" on storage.objects;
drop policy if exists "avatars_select_public"         on storage.objects;

alter policy "avatars_insert_owner" on storage.objects
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter policy "avatars_update_owner" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter policy "avatars_delete_owner" on storage.objects
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
