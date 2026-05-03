-- =============================================================================
-- G-DIMENSION — Migration 008: job_photos
-- =============================================================================
-- Photos attached to individual jobs within a session. These feed the Photos
-- masonry gallery destination (Part 14) filtered by type.
--
-- PHOTO DESTINATION QUERY MAP (Part 14):
--   Filter: MODIFICATIONS → job_photos JOIN jobs WHERE jobs.type = 'modification'
--   Filter: SERVICE       → job_photos JOIN jobs WHERE jobs.type = 'maintenance'
--   Filter: DETAIL        → job_photos JOIN jobs WHERE jobs.type = 'detail'
--   Filter: GARAGE        → cars.garage_photo_url + cars.showcase_photo_url (separate query)
--   Filter: ALL           → all of the above + timeline_entries.photo_url (origin)
--
-- PERFORMANCE PROBLEM IDENTIFIED (Task 1 Schema Review):
--   The original schema has no car_id on job_photos. To find all photos for a
--   car requires: job_photos → jobs → sessions → cars (3 joins).
--   For the Photos gallery this is a hot path queried constantly.
--   SOLUTION: Denormalize car_id onto job_photos. It is always derivable from
--   the job chain but storing it here makes the Photos query a single-table
--   scan with an index. Kept in sync by trigger (see below).
-- =============================================================================

create table if not exists public.job_photos (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null references public.jobs(id) on delete cascade,

  -- Denormalized for performance — see header note
  car_id          uuid not null references public.cars(id) on delete cascade,

  -- Photo data
  photo_url       text not null,      -- Storage bucket URL (job-photos bucket)
  caption         text,
  display_order   integer not null default 0,

  -- Timestamps
  created_at      timestamptz not null default now()
);

comment on table  public.job_photos is 'Photos attached to jobs. Feeds the Photos masonry gallery destination.';
comment on column public.job_photos.car_id is 'Denormalized from job→session→car chain. Enables direct Photos gallery query without 3 joins.';
comment on column public.job_photos.display_order is 'Sort order within a job. Lower = shown first.';

-- =============================================================================
-- FUNCTION: Populate car_id from job chain on insert
-- Ensures car_id is always correct and in sync without caller needing to know
-- the full chain.
-- =============================================================================

create or replace function public.job_photos_set_car_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_car_id uuid;
begin
  select s.car_id into v_car_id
  from public.jobs j
  join public.sessions s on s.id = j.session_id
  where j.id = new.job_id;

  if v_car_id is null then
    -- Job may not have a session yet (planned/Parts Bin)
    -- In this case, caller must supply car_id explicitly
    -- If still null, raise an error
    if new.car_id is null then
      raise exception 'job_photos requires car_id (job % has no session)', new.job_id;
    end if;
  else
    new.car_id = v_car_id;
  end if;

  return new;
end;
$$;

create trigger job_photos_auto_car_id
  before insert on public.job_photos
  for each row execute procedure public.job_photos_set_car_id();

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Photos gallery: all photos for a car (ALL filter)
create index if not exists job_photos_car_id
  on public.job_photos (car_id, created_at desc);

-- Photos gallery: filtered by job type (requires join to jobs)
-- Covering index to avoid join for type-filtered gallery queries
create index if not exists job_photos_job_id
  on public.job_photos (job_id);

-- Display order within a job (job detail view)
create index if not exists job_photos_job_order
  on public.job_photos (job_id, display_order asc);

-- =============================================================================
-- RLS enabled here; policies in 015_rls_policies.sql
-- =============================================================================
alter table public.job_photos enable row level security;
