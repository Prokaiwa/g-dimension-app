-- =============================================================================
-- G-DIMENSION — Migration 047: photos + links for Timeline entries
-- =============================================================================
-- Free-form Timeline notes (migration 046) can carry MULTIPLE photos and links
-- (e.g. a track day with a few shots + a YouTube lap video), added at compose
-- time. Two child tables, mirroring job_photos / job_links:
--
--   timeline_entry_photos  — gallery for an entry (the entry's photo_url stays
--                            the hero/first, used by the Timeline card thumbnail
--                            and the Photos gallery; the full set lives here).
--   timeline_entry_links   — URLs (YouTube etc.) shown on the Entry Detail page.
--
-- car_id is denormalized on both for 1-hop RLS, exactly like job_photos.
-- Public timelines (cars.is_public) expose these read-only, matching the
-- timeline_entries visibility boundary.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- ── timeline_entry_photos ──
create table if not exists public.timeline_entry_photos (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.timeline_entries(id) on delete cascade,
  car_id        uuid not null references public.cars(id) on delete cascade,
  photo_url     text not null,
  display_order integer default 0,
  created_at    timestamptz not null default now()
);

create index if not exists timeline_entry_photos_entry
  on public.timeline_entry_photos (entry_id, display_order);

-- ── timeline_entry_links ──
create table if not exists public.timeline_entry_links (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.timeline_entries(id) on delete cascade,
  car_id        uuid not null references public.cars(id) on delete cascade,
  url           text not null,
  label         text,
  display_order integer default 0,
  created_at    timestamptz not null default now()
);

create index if not exists timeline_entry_links_entry
  on public.timeline_entry_links (entry_id, display_order);

-- ── RLS ──
alter table public.timeline_entry_photos enable row level security;
alter table public.timeline_entry_links  enable row level security;

-- Owners: full access via car_id → cars.user_id (1-hop)
create policy "tl_entry_photos_all_owner" on public.timeline_entry_photos
  for all
  using      (exists (select 1 from public.cars where cars.id = timeline_entry_photos.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = timeline_entry_photos.car_id and cars.user_id = auth.uid()));

create policy "tl_entry_links_all_owner" on public.timeline_entry_links
  for all
  using      (exists (select 1 from public.cars where cars.id = timeline_entry_links.car_id and cars.user_id = auth.uid()))
  with check (exists (select 1 from public.cars where cars.id = timeline_entry_links.car_id and cars.user_id = auth.uid()));

-- Public: readable for public, non-deleted cars (matches timeline_entries)
create policy "tl_entry_photos_select_public" on public.timeline_entry_photos
  for select
  using (exists (select 1 from public.cars where cars.id = timeline_entry_photos.car_id and cars.is_public = true and cars.deleted_at is null));

create policy "tl_entry_links_select_public" on public.timeline_entry_links
  for select
  using (exists (select 1 from public.cars where cars.id = timeline_entry_links.car_id and cars.is_public = true and cars.deleted_at is null));

-- ── Grants (required for tables created after 2026-05-30) ──
grant select, insert, update, delete on public.timeline_entry_photos to authenticated;
grant select, insert, update, delete on public.timeline_entry_links  to authenticated;
grant select on public.timeline_entry_photos to anon;
grant select on public.timeline_entry_links  to anon;

notify pgrst, 'reload schema';
