-- 076_public_sessions_links.sql
-- PENDING — apply in the Supabase SQL editor (after 075).
--
-- Three anon-visibility fixes found by the logged-out visitor audit
-- (2026-07-18). All three made public pages silently poorer for visitors
-- while looking fine to the logged-in owner:
--
-- 1. sessions had NO public-read policy (015 only ever created the owner
--    policy), so anon got zero rows / permission-denied everywhere:
--    - Public Build Sheet: titled group sessions ("Built Block") never
--      appeared as groups — their component mods spilled out as solo rows.
--    - Public Timeline + Entry Detail: session titles, shop name, and
--      mileage never rendered.
--    The anon column GRANT is deliberately partial: identity/display columns
--    only. labor_cost / tax_amount / total_cost / journal_entry / notes are
--    NOT granted — session financials stay owner-only (Public Profile
--    Boundary: no costs), enforced at the grant level like users (071).
--
-- 2. job_links had NO public-read policy (031 only created the owner
--    policy), so purchase/YouTube links never showed on the public Mod
--    Detail or Entry Detail pages. user_id is NOT granted.
--
-- 3. jobs_public_read (053) gated on show_buildsheet_publicly only, but the
--    public Featured magazine also reads jobs. An owner who hid the Build
--    Sheet but kept Featured public silently got an empty magazine (no mods,
--    no spec sheet). The policy now honors either flag; the cars column
--    grant gains show_featured_publicly so the subquery can evaluate it.
--
-- Idempotent. After applying: bump the hotfixes.sql watermark + the CLAUDE.md
-- migration range to 076.

-- ── 1. sessions: public read (identity/display columns only) ────────────────
-- Owner policy from 015 was FOR ALL with no role clause; hotfixes scoped it to
-- authenticated — restated here so the migration sequence alone produces the
-- right state.
alter policy "sessions_all_owner" on public.sessions to authenticated;

drop policy if exists "sessions_public_read" on public.sessions;
create policy "sessions_public_read"
  on public.sessions for select
  using (
    exists (
      select 1 from public.cars c
      where c.id = sessions.car_id
        and c.is_public = true
        and c.deleted_at is null
        and (c.show_buildsheet_publicly = true or c.show_timeline_publicly = true)
    )
  );

-- Column-level anon grant: everything the public pages select, nothing more.
-- (Public queries: id/car_id/type filters + title, shop_name, mileage display.)
grant select (id, car_id, type, title, shop_name, mileage)
  on public.sessions to anon;

-- ── 2. job_links: public read (no user_id) ──────────────────────────────────
alter policy "Users manage own job links" on public.job_links to authenticated;

drop policy if exists "job_links_public_read" on public.job_links;
create policy "job_links_public_read"
  on public.job_links for select
  using (
    exists (
      select 1
      from public.jobs j
      join public.cars c on c.id = j.car_id
      where j.id = job_links.job_id
        and c.is_public = true
        and c.deleted_at is null
        and (c.show_buildsheet_publicly = true or c.show_timeline_publicly = true)
    )
  );

grant select (id, job_id, url, label, display_order)
  on public.job_links to anon;

-- ── 3. jobs: honor the Featured flag too ────────────────────────────────────
drop policy if exists "jobs_public_read" on public.jobs;
create policy "jobs_public_read"
  on public.jobs for select
  using (
    status = 'installed'
    and exists (
      select 1 from public.cars c
      where c.id = jobs.car_id
        and c.is_public = true
        and c.deleted_at is null
        and (c.show_buildsheet_publicly = true or c.show_featured_publicly = true)
    )
  );

-- The policy subqueries above evaluate cars columns as the anon role — extend
-- the 053 column grant with the Featured flag (append-only; re-granting the
-- existing columns is a no-op).
grant select (id, is_public, deleted_at, show_buildsheet_publicly, show_timeline_publicly, show_featured_publicly)
  on public.cars to anon;

notify pgrst, 'reload schema';
