-- =============================================================================
-- G-DIMENSION — Migration 015: Row Level Security Policies
-- =============================================================================
-- Security layer. Every table with user data has RLS enabled in its own
-- migration. This file writes the actual policies.
--
-- POLICY DESIGN PRINCIPLES:
--   1. Default deny — RLS blocks all access unless a policy explicitly allows.
--   2. Own data only — users can only see/modify rows they own.
--   3. Public car exception — cars and their timeline entries are readable
--      without auth when is_public = true and deleted_at is null.
--   4. Depth enforcement — tables that are multiple joins away from users
--      use the denormalized car_id column (added in migrations 008 and 009)
--      for a single-hop ownership check instead of expensive join chains.
--   5. Pro feature gating — PDF export and other Pro features are gated at
--      the API/Edge Function layer. When Pro-only DB tables are added
--      (api_keys, etc.), their policies will check subscription_status = 'pro'.
--   6. Error/analytics INSERT — separate anon policies allow pre-auth logging.
--
-- TABLES COVERED HERE:
--   users, cars, sessions, jobs, timeline_entries, job_photos,
--   receipts, car_contacts, car_documents, car_reminders,
--   error_logs, analytics_events
--
-- TABLES WITH POLICIES IN THEIR OWN MIGRATION FILE:
--   user_flags              → 019_022_infrastructure_tables.sql
--   audit_log               → 019_022_infrastructure_tables.sql
--   notification_preferences→ 019_022_infrastructure_tables.sql
--   (public build sheet RLS)→ 023_public_profile_boundary.sql
--
-- REFERENCE TABLES (no RLS — public read, service role writes only):
--   vehicle_makes, vehicle_models, vehicle_variants, vehicle_search_aliases
--
-- POLICY NAMING CONVENTION:
--   "{table}_{action}_{who}"
--   e.g. "cars_select_owner", "timeline_entries_select_public"
-- =============================================================================

-- =============================================================================
-- REFERENCE TABLES
-- Public read via GRANT. No user writes. Service role handles all inserts
-- (import scripts run with service role key which bypasses RLS entirely).
-- =============================================================================

grant select on public.vehicle_makes  to anon, authenticated;
grant select on public.vehicle_models to anon, authenticated;
-- vehicle_variants and vehicle_search_aliases are granted in 017 and 018
-- respectively, after those tables are created.


-- =============================================================================
-- users
-- =============================================================================

-- Owners can read and modify their own profile
create policy "users_all_owner"
  on public.users
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Public profile pages need to read basic user info (/builds/:username).
-- Column restriction (only username, display_name, avatar_url, city, country)
-- is enforced at the app query layer — RLS controls rows only.
create policy "users_select_public"
  on public.users
  for select
  using (
    deleted_at is null
    and username is not null
  );


-- =============================================================================
-- cars
-- =============================================================================

-- Owners: full access to all their cars including soft-deleted
-- (soft-deleted cars are visible to the owner for the 7-day recovery UI)
create policy "cars_all_owner"
  on public.cars
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public (including anon): read cars that are marked public and not deleted
-- Powers /builds/:username without requiring login
create policy "cars_select_public"
  on public.cars
  for select
  using (is_public = true and deleted_at is null);


-- =============================================================================
-- sessions
-- =============================================================================

-- Owners only — 1-hop check via car_id → cars.user_id
-- Sessions are never exposed publicly. Session data (costs, shop names, notes)
-- flows to the public profile only through the sanitized timeline_entries and
-- public_build_sheet view — never as raw session rows.
create policy "sessions_all_owner"
  on public.sessions
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = sessions.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = sessions.car_id
        and cars.user_id = auth.uid()
    )
  );


-- =============================================================================
-- jobs
-- =============================================================================

-- Owners only — uses jobs.car_id for a direct 1-hop ownership check.
--
-- WHY car_id AND NOT session_id:
--   jobs.car_id is always populated (either directly for Blueprint/Parts Bin
--   jobs, or auto-derived from the session chain by the trigger in 006_jobs.sql).
--   Using car_id here means:
--     - sessioned jobs (type=modification with a real session): car_id set by trigger ✓
--     - standalone jobs (Blueprint / Parts Bin, session_id null): car_id set directly ✓
--   A single policy covers both cases cleanly with no security gaps.
--
-- PREVIOUS VERSION HAD A BUG:
--   The old policy used `session_id is null OR exists(...)`. The `session_id is null`
--   branch allowed ANY authenticated user to access any Blueprint/Parts Bin job
--   because it had no ownership check. Fixed by using car_id exclusively.
create policy "jobs_all_owner"
  on public.jobs
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = jobs.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = jobs.car_id
        and cars.user_id = auth.uid()
    )
  );

-- NOTE: A public SELECT policy for installed modifications is added in
-- 023_public_profile_boundary.sql as "jobs_select_public_buildsheet".
-- That policy powers the public_build_sheet VIEW on /builds/:username.


-- =============================================================================
-- timeline_entries
-- =============================================================================

-- Owners: full access
create policy "timeline_entries_all_owner"
  on public.timeline_entries
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = timeline_entries.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = timeline_entries.car_id
        and cars.user_id = auth.uid()
    )
  );

-- Public: timeline of public cars is readable without auth
-- This is the key policy for the /builds/:username Timeline view
create policy "timeline_entries_select_public"
  on public.timeline_entries
  for select
  using (
    exists (
      select 1 from public.cars
      where cars.id = timeline_entries.car_id
        and cars.is_public = true
        and cars.deleted_at is null
    )
  );

-- ORIGIN ENTRY DELETE PROTECTION:
-- In addition to the app-layer guard, this DB trigger prevents deletion of
-- the Origin Entry at the database level. No application code or direct SQL
-- can delete an Origin Entry row.
create or replace function public.prevent_origin_entry_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_origin = true then
    raise exception 'Origin Entry cannot be deleted. Edit only via long-press.';
  end if;
  return old;
end;
$$;

create trigger timeline_entries_no_origin_delete
  before delete on public.timeline_entries
  for each row execute procedure public.prevent_origin_entry_delete();


-- =============================================================================
-- job_photos
-- =============================================================================

-- Owners: full access — uses denormalized car_id (1-hop, efficient)
create policy "job_photos_all_owner"
  on public.job_photos
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = job_photos.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = job_photos.car_id
        and cars.user_id = auth.uid()
    )
  );

-- Public: job photos of public cars visible on /builds/:username
create policy "job_photos_select_public"
  on public.job_photos
  for select
  using (
    exists (
      select 1 from public.cars
      where cars.id = job_photos.car_id
        and cars.is_public = true
        and cars.deleted_at is null
    )
  );


-- =============================================================================
-- receipts
-- =============================================================================

-- Owners only. Receipts are private financial documents — never public.
-- Uses denormalized car_id (1-hop, efficient).
create policy "receipts_all_owner"
  on public.receipts
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = receipts.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = receipts.car_id
        and cars.user_id = auth.uid()
    )
  );
-- NO public SELECT policy — receipt data is financial and personal.


-- =============================================================================
-- car_contacts
-- =============================================================================

create policy "car_contacts_all_owner"
  on public.car_contacts
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_contacts.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_contacts.car_id
        and cars.user_id = auth.uid()
    )
  );
-- NO public SELECT — contact info is personal data.


-- =============================================================================
-- car_documents
-- =============================================================================

create policy "car_documents_all_owner"
  on public.car_documents
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_documents.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_documents.car_id
        and cars.user_id = auth.uid()
    )
  );
-- NO public SELECT — documents contain VINs, plate numbers, insurance policy
-- numbers, and other identity-sensitive data. Never exposed publicly.


-- =============================================================================
-- car_reminders
-- =============================================================================

create policy "car_reminders_all_owner"
  on public.car_reminders
  for all
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_reminders.car_id
        and cars.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_reminders.car_id
        and cars.user_id = auth.uid()
    )
  );


-- =============================================================================
-- error_logs
-- =============================================================================

-- Owners can read their own error logs (future "report a bug" feature)
create policy "error_logs_select_owner"
  on public.error_logs
  for select
  using (auth.uid() = user_id);

-- Authenticated users can insert errors for themselves, or with user_id null
-- (errors that occur after login but in a context where uid isn't available)
create policy "error_logs_insert_authenticated"
  on public.error_logs
  for insert
  with check (auth.uid() = user_id or user_id is null);

-- Anon users can insert errors with user_id null only
-- This is intentional — error logging must work before auth (login failures,
-- public page errors, app startup crashes)
create policy "error_logs_insert_anon"
  on public.error_logs
  for insert
  to anon
  with check (user_id is null);

-- No UPDATE or DELETE by users — error logs are immutable records.


-- =============================================================================
-- analytics_events
-- =============================================================================

-- Authenticated users can log events for themselves or with null user_id
create policy "analytics_events_insert_authenticated"
  on public.analytics_events
  for insert
  with check (auth.uid() = user_id or user_id is null);

-- Anon users can log public events (public profile views, etc.)
create policy "analytics_events_insert_anon"
  on public.analytics_events
  for insert
  to anon
  with check (user_id is null);

-- No SELECT for users — analytics data is admin/internal only.
-- Query via Supabase service role or future API product layer.


-- =============================================================================
-- VERIFICATION QUERY
-- After running all migrations, paste this in the SQL Editor to confirm
-- every user-data table has RLS enabled:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (
--     'vehicle_makes','vehicle_models',
--     'vehicle_variants','vehicle_search_aliases'
--   )
-- ORDER BY tablename;
--
-- Expected: rowsecurity = true for every row returned.
-- =============================================================================
