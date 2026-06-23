-- =============================================================================
-- G-DIMENSION — Migration 059: DIY install guides for mods
-- =============================================================================
-- A DIY guide is a property OF a mod (job), not a standalone section — it lives
-- as a sub-page off the mod detail (Tuning → mod → "DIY Guide"). Public visitors
-- reach it the natural way: Build Sheet → tap a mod → "View Install Guide", which
-- only appears when a guide exists. No 5th home-map node; the Build Sheet stays
-- the index. DIY is a light-styled "aesthetic island" (like Parts Bin / Featured).
--
-- Three normalized tables — deliberately NOT a jsonb blob, so the future search
-- system ("2014 WRX coilovers → DIY steps") can query difficulty, tools, and
-- step content directly:
--
--   diy_guides       — one per mod (UNIQUE job_id): difficulty, time, video, tools
--   diy_steps        — ordered steps per guide (title + description)
--   diy_step_photos  — MULTIPLE captioned photos per step
--
-- difficulty is stored as numeric(2,1) in 0.5 increments (1.0–5.0) to support
-- the half-star rating system on the frontend. UI maps to labels:
--   1.0–1.5 → Beginner  2.0–2.5 → Easy  3.0 → Intermediate
--   3.5–4.0 → Hard      4.5–5.0 → Expert
--
-- car_id is denormalized on all three for 1-hop RLS (mirrors job_photos), which
-- also keeps the future cross-car search queries cheap.
--
-- Photos reuse the existing PUBLIC `job-photos` bucket (keeps bucket count at 6),
-- under a distinct path: {userId}/{carId}/diy/{guideId}/{stepId}/{ts}-{rand}.jpg.
-- They are surfaced ONLY via diy_step_photos — no job_photos query can reach
-- them, so DIY images never leak onto the Build Sheet / carousel / Featured.
--
-- Public read mirrors the Build Sheet boundary: a guide is visible to anon only
-- when cars.is_public = true AND cars.show_buildsheet_publicly = true (the same
-- gate the jobs anon policy uses in migration 053).
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- ── diy_guides ──
create table if not exists public.diy_guides (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null unique references public.jobs(id) on delete cascade,
  car_id         uuid not null references public.cars(id) on delete cascade,
  -- 1.0–5.0 in 0.5 steps; NULL = unset. Maps to half-star rating on frontend.
  difficulty     numeric(2,1) check (difficulty is null or (difficulty >= 1.0 and difficulty <= 5.0)),
  estimated_time text,                       -- free text: "2–3 hours", "full weekend"
  youtube_url    text,
  tools          text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists diy_guides_job on public.diy_guides (job_id);
create index if not exists diy_guides_car on public.diy_guides (car_id);

-- ── diy_steps ──
create table if not exists public.diy_steps (
  id          uuid primary key default gen_random_uuid(),
  guide_id    uuid not null references public.diy_guides(id) on delete cascade,
  car_id      uuid not null references public.cars(id) on delete cascade,
  step_order  integer not null default 0,
  title       text,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists diy_steps_guide on public.diy_steps (guide_id, step_order);

-- ── diy_step_photos ──
create table if not exists public.diy_step_photos (
  id            uuid primary key default gen_random_uuid(),
  step_id       uuid not null references public.diy_steps(id) on delete cascade,
  car_id        uuid not null references public.cars(id) on delete cascade,
  photo_url     text not null,
  caption       text,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists diy_step_photos_step on public.diy_step_photos (step_id, display_order);

-- ── RLS ──
alter table public.diy_guides      enable row level security;
alter table public.diy_steps       enable row level security;
alter table public.diy_step_photos enable row level security;

-- Owners: full access via car_id → cars.user_id (1-hop)
create policy "diy_guides_all_owner" on public.diy_guides
  for all
  using      (exists (select 1 from public.cars where cars.id = diy_guides.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = diy_guides.car_id and cars.user_id = auth.uid()));

create policy "diy_steps_all_owner" on public.diy_steps
  for all
  using      (exists (select 1 from public.cars where cars.id = diy_steps.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = diy_steps.car_id and cars.user_id = auth.uid()));

create policy "diy_step_photos_all_owner" on public.diy_step_photos
  for all
  using      (exists (select 1 from public.cars where cars.id = diy_step_photos.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = diy_step_photos.car_id and cars.user_id = auth.uid()));

-- Public: readable for public, non-deleted cars whose Build Sheet is public
-- (matches the jobs anon policy in migration 053).
create policy "diy_guides_select_public" on public.diy_guides
  for select
  using (exists (select 1 from public.cars c
                 where c.id = diy_guides.car_id
                   and c.is_public = true
                   and c.deleted_at is null
                   and c.show_buildsheet_publicly = true));

create policy "diy_steps_select_public" on public.diy_steps
  for select
  using (exists (select 1 from public.cars c
                 where c.id = diy_steps.car_id
                   and c.is_public = true
                   and c.deleted_at is null
                   and c.show_buildsheet_publicly = true));

create policy "diy_step_photos_select_public" on public.diy_step_photos
  for select
  using (exists (select 1 from public.cars c
                 where c.id = diy_step_photos.car_id
                   and c.is_public = true
                   and c.deleted_at is null
                   and c.show_buildsheet_publicly = true));

-- ── Grants (required for tables created after 2026-05-30) ──
grant select, insert, update, delete on public.diy_guides      to authenticated;
grant select, insert, update, delete on public.diy_steps       to authenticated;
grant select, insert, update, delete on public.diy_step_photos to authenticated;
grant select on public.diy_guides      to anon;
grant select on public.diy_steps       to anon;
grant select on public.diy_step_photos to anon;

notify pgrst, 'reload schema';
