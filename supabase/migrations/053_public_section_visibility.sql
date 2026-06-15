-- 053_public_section_visibility.sql
-- Per-section public visibility for the Featured / Build Sheet / Timeline rooms
-- on /builds/:username, plus the anon read access the public map needs.
--
-- The whole-page switch is unchanged: cars.is_public still gates EVERYTHING
-- (the public_car_profiles view filters on it, and every policy below requires
-- it). These three flags add finer control on top — an owner can keep the page
-- public but hide an individual room. Default true = current behaviour.
--
-- Privacy is enforced in RLS (not just hidden in the UI): when a section flag
-- is false, anon literally cannot read the underlying rows.

alter table public.cars
  add column if not exists show_buildsheet_publicly boolean not null default true,
  add column if not exists show_timeline_publicly   boolean not null default true,
  add column if not exists show_featured_publicly    boolean not null default true;

comment on column public.cars.show_buildsheet_publicly is
  'Public profile: show the Build Sheet room on /builds/:username. Enforced in the jobs anon RLS policy.';
comment on column public.cars.show_timeline_publicly is
  'Public profile: show the Timeline room. Enforced in the timeline_entries anon RLS policy.';
comment on column public.cars.show_featured_publicly is
  'Public profile: show the Featured room. Enforced by nulling featured_story in the view + the frontend node gate.';

-- ── Scope the owner policies to authenticated ───────────────────────────────
-- cars_all_owner / jobs_all_owner / timeline_entries_all_owner were created
-- FOR ALL with NO role clause, so they're evaluated for the anon role too. Each
-- references cars.user_id in its subquery, and anon has no (and must never have)
-- grant on cars.user_id — so ANY anon SELECT on these tables raised
-- `permission denied for table cars` before a single row could be read. anon can
-- never satisfy auth.uid() = user_id anyway, so scoping these to authenticated
-- is purely corrective.
alter policy "cars_all_owner"             on public.cars             to authenticated;
alter policy "jobs_all_owner"             on public.jobs             to authenticated;
alter policy "timeline_entries_all_owner" on public.timeline_entries to authenticated;

-- ── Public read for the map (anon AND authenticated visitors) ────────────────
-- The pre-existing public policies (jobs_select_public_buildsheet from 023,
-- timeline_entries_select_public from 015) do NOT check the new per-section
-- flags, so they'd let anon read even when a section is toggled private —
-- making the toggle cosmetic. Replace them with flag-aware policies. No TO
-- clause = public (anon + authenticated), so a logged-in visitor viewing
-- someone else's build is covered too.
drop policy if exists "jobs_select_public_buildsheet" on public.jobs;
drop policy if exists "jobs_public_read"              on public.jobs;
create policy "jobs_public_read"
  on public.jobs for select
  using (
    status = 'installed'
    and exists (
      select 1 from public.cars c
      where c.id = jobs.car_id
        and c.is_public = true
        and c.deleted_at is null
        and c.show_buildsheet_publicly = true
    )
  );
grant select on public.jobs to anon;

drop policy if exists "timeline_entries_select_public" on public.timeline_entries;
drop policy if exists "timeline_entries_public_read"    on public.timeline_entries;
create policy "timeline_entries_public_read"
  on public.timeline_entries for select
  using (
    exists (
      select 1 from public.cars c
      where c.id = timeline_entries.car_id
        and c.is_public = true
        and c.deleted_at is null
        and c.show_timeline_publicly = true
    )
  );
grant select on public.timeline_entries to anon;

-- ── anon needs to read cars within the policy subqueries above ───────────────
-- The public policies reference public.cars in a subquery, itself subject to
-- cars RLS + grants for the querying role. A COLUMN-level grant (not the whole
-- table) lets anon read the gate columns while keeping VIN / plate / purchase
-- price unreadable. Row visibility is still limited to public cars by
-- cars_select_public.
grant select (id, is_public, deleted_at, show_buildsheet_publicly, show_timeline_publicly)
  on public.cars to anon;

-- ── Refresh the public view: expose the flags, and hide the Featured story
-- text when the Featured room is private (append-only column list) ──
create or replace view public.public_car_profiles as
  select
    c.id, c.user_id, c.year, c.make, c.model, c."trim", c.variant_id,
    c.chassis_code, c.nickname, c.color, c.engine_type, c.transmission,
    c.drivetrain, c.forced_induction, c.horsepower, c.torque,
    c.current_mileage, c.is_import, c.garage_photo_url, c.showcase_photo_url,
    c.photo_y_offset, c.purchase_story, c.purchase_date, c.is_public,
    c.show_investment_publicly, c.created_at,
    u.username, u.display_name, u.avatar_url, u.city, u.country,
    c.usage_type, c.engine_origin, c.weight_lbs,
    c.build_sheet_power_photo, c.build_sheet_chassis_photo,
    c.build_sheet_exterior_photo, c.build_sheet_interior_photo,
    c.original_photo_url, c.cover_focus_x, c.cover_focus_y, c.cover_zoom,
    -- Featured story is withheld when the Featured room is private:
    case when c.show_featured_publicly then c.featured_story else null end as featured_story,
    -- appended for per-section visibility (053):
    c.show_buildsheet_publicly,
    c.show_timeline_publicly,
    c.show_featured_publicly,
    -- the owner's chosen primary car, so the public profile lands on it
    -- (not merely the newest-created public car):
    u.active_car_id
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
