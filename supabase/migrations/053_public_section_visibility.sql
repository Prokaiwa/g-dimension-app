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

-- ── anon read for the public map ────────────────────────────────────────────
-- jobs: anon may read rows for a public, non-deleted car whose Build Sheet is
-- shared. (Costs are not exposed to anon by the public profile UI; RLS is the
-- gate on row visibility.)
drop policy if exists "jobs_public_read" on public.jobs;
create policy "jobs_public_read"
  on public.jobs for select
  to anon
  using (
    exists (
      select 1 from public.cars c
      where c.id = jobs.car_id
        and c.is_public = true
        and c.deleted_at is null
        and c.show_buildsheet_publicly = true
    )
  );
grant select on public.jobs to anon;

-- timeline_entries: anon may read entries for a public, non-deleted car whose
-- Timeline is shared.
drop policy if exists "timeline_entries_public_read" on public.timeline_entries;
create policy "timeline_entries_public_read"
  on public.timeline_entries for select
  to anon
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
-- The jobs / timeline_entries anon policies each reference public.cars in a
-- subquery, which is itself subject to cars RLS + table grants for the anon
-- role. anon had NO grant on cars (only authenticated did) — so those subqueries
-- silently returned nothing and the Build Sheet / Timeline nodes never appeared.
-- A COLUMN-level grant (not the whole table) lets the gate columns be read while
-- keeping VIN / plate / purchase price unreadable to anon at the table level.
-- Row visibility is still limited to public cars by the existing
-- cars_select_public policy.
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
    c.show_featured_publicly
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
