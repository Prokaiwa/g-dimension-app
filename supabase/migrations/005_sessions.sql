-- =============================================================================
-- G-DIMENSION — Migration 005: sessions
-- =============================================================================
-- A session is one real-world event: one visit to the shop, one day of
-- wrenching, one detail appointment. It is the Timeline card — the story unit
-- that the user curates. Sessions contain one or more jobs (see 006_jobs.sql).
--
-- SESSION → TIMELINE RELATIONSHIP:
--   add_to_timeline = true   → a timeline_entry row is auto-created (trigger
--                               or app logic after insert).
--   add_to_timeline = false  → session exists in Tuning/Maintenance records
--                               but never appears in the Timeline scroll.
--   Default: true for modification sessions, false for routine maintenance,
--   true for detail sessions (Part 12 / Part 27 Decisions Log).
--
-- NAMING NOTE:
--   This table is named `sessions` in the public schema. Supabase uses
--   `auth.sessions` internally. They coexist cleanly (different schemas)
--   but be explicit with schema prefixes in any cross-schema queries.
--
-- MILEAGE: stored in miles (base unit). Display conversion via users.distance_unit.
-- =============================================================================

create table if not exists public.sessions (
  id                  uuid primary key default gen_random_uuid(),
  car_id              uuid not null references public.cars(id) on delete cascade,

  -- Session classification
  type                text not null
                        check (type in ('modification','maintenance','detail')),

  -- When and how
  date_performed      date not null default current_date,
  performed_by        text check (performed_by in ('self','shop')),
  shop_name           text,               -- Only relevant when performed_by = 'shop'
  mileage             integer,            -- Miles at time of service (stored in miles)

  -- Cost
  total_cost          decimal(10,2),      -- Sum of jobs.cost or manually entered
  cost_currency       char(3) default 'USD',  -- ISO 4217 forward-looking

  -- Time
  time_taken          text,               -- Free text: "3 hours", "full day", "weekend"

  -- Notes (session-level — the story of that day)
  notes               text,               -- Session-level technical/general notes

  -- Timeline (Part 12)
  add_to_timeline     boolean not null default false,
  timeline_photo_url  text,               -- Hero photo for the Timeline card
  journal_entry       text,               -- Personal note shown on Timeline card (Cormorant)

  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table  public.sessions is 'A real-world event: one shop visit, one day of work. The Timeline card unit.';
comment on column public.sessions.mileage is 'Vehicle mileage at time of service. Stored in miles.';
comment on column public.sessions.add_to_timeline is 'When true, triggers creation of a timeline_entry row.';
comment on column public.sessions.journal_entry is 'Personal human narrative. Rendered in Cormorant Garamond on Timeline cards.';
comment on column public.sessions.timeline_photo_url is 'Hero photo for Timeline card. Stored in timeline-photos bucket.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- All sessions for a car (Maintenance overview, Timeline feed)
create index if not exists sessions_car_id
  on public.sessions (car_id, date_performed desc);

-- Timeline-only sessions for a car
create index if not exists sessions_car_timeline
  on public.sessions (car_id, date_performed desc)
  where add_to_timeline = true;

-- Sessions by type for a car (Service vs Detail tab filtering)
create index if not exists sessions_car_type
  on public.sessions (car_id, type, date_performed desc);

-- =============================================================================
-- TRIGGER: updated_at
-- =============================================================================
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- RLS enabled here; policies in 015_rls_policies.sql
-- =============================================================================
alter table public.sessions enable row level security;
