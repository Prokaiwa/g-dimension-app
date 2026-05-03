-- =============================================================================
-- G-DIMENSION — Migration 006: jobs (v2 — updated)
-- =============================================================================
-- Changes from original:
--   + car_id (nullable FK) — anchors Blueprint/Parts Bin jobs with no session yet
--   + still_owned (boolean) — when removing a part, did the user keep it?
--   + cost_notes (text) — "free from friend" / "sponsored" → excluded from price agg
--   + cost_currency — multi-currency for JDM/EU build costs
--   + Trigger 1: auto-populate car_id from session chain on insert
--   + Trigger 2: removed + still_owned → auto-create new Parts Bin entry
--
-- JOB STATUS LIFECYCLE (Part 11 / Part 27):
--   planned    → you want it (Blueprint / wishlist)
--   purchased  → you own it, not yet installed (Parts Bin)
--   installed  → currently on the car (Build Sheet — primary query)
--   removed    → was on the car, taken off (date_removed populated)
--   sold       → removed and sold to someone else
--   scrapped   → removed and discarded
--
-- THE REMOVED → PARTS BIN FLOW:
--   When an installed part is removed AND still_owned = true:
--   Trigger 2 fires and creates a NEW job row with status = 'purchased'.
--   Example: User removes an HKS Cold Air Intake.
--     Original job: status='removed', date_removed='2024-10-15' → historical record
--     New job:      status='purchased', no session → appears in Parts Bin
--   The history is preserved. The part surfaces in Parts Bin. Both are true.
--   When the user reinstalls it on any car, they create a new session
--   and change the Parts Bin job's status to 'installed'.
--
-- car_id vs session_id anchor:
--   session_id = NULL  → standalone job (Blueprint or Parts Bin, no real event yet)
--   car_id = set directly when session_id is null
--   car_id = auto-derived from session → car chain when session_id is set
--   Constraint: at least one of session_id or car_id must be non-null.
--
-- PRICE AGGREGATION RULES:
--   Include:  cost > 0 AND cost_notes IS NULL
--   Exclude:  cost = 0 (placeholder or free)
--   Exclude:  cost_notes IS NOT NULL (user flagged it — "free from friend", "sponsored")
-- =============================================================================

create table if not exists public.jobs (
  id              uuid primary key default gen_random_uuid(),

  -- Session anchor (nullable — Blueprint/Parts Bin jobs have no session yet)
  session_id      uuid references public.sessions(id) on delete cascade,

  -- Direct car anchor:
  --   Required when session_id is null (standalone job)
  --   Auto-populated from session chain when session_id is set (via trigger)
  car_id          uuid references public.cars(id) on delete cascade,

  -- Classification
  type            text not null
                    check (type in ('modification','maintenance','detail')),
  category        text,
  -- modification:  Engine, Drivetrain, Suspension, Brakes, Wheels & Tires, Exhaust,
  --                Cooling, Fuel System, Electrical, Audio, Safety,
  --                Exterior, Paint & Wrap, Interior, Other
  -- maintenance:   Oil Change, Tires, Brakes, Fluids, Filters, Inspection,
  --                Transmission, Cooling, Other
  -- detail:        Wash, Clay, Polish, Ceramic Coating, Paint Protection Film,
  --                Interior, Other
  title           text not null,

  -- Part lifecycle
  status          text not null
                    check (status in ('planned','purchased','installed','removed','sold','scrapped'))
                    default 'installed',
  date_installed  date,
  date_removed    date,

  -- Removal context
  still_owned     boolean not null default false,
  -- When status → 'removed': true = user kept it → auto-creates Parts Bin entry
  -- false = part is gone (sold or scrapped — status column reflects which)

  -- Part identification (price aggregator keys)
  brand           text,               -- e.g. "HKS", "Tein", "Enkei", "Brembo"
  part_number     text,               -- e.g. "70019-AN001"

  -- Cost
  cost            decimal(10,2),
  cost_currency   char(3) default 'USD',
  cost_notes      text,
  -- cost_notes examples: "free from friend", "warranty replacement", "sponsored",
  -- "traded for stock manifold", "won at raffle"
  -- Any non-null value → excluded from price aggregation

  -- Detail-specific
  products_used   text,

  -- Notes (job-level, searchable — future feature per architecture Part 27)
  notes           text,

  -- Timestamps
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Business rule: every job must be anchored to a car one way or another
  constraint jobs_must_have_car_anchor check (
    session_id is not null or car_id is not null
  )
);

comment on table  public.jobs is 'Individual tasks/parts within a session. Lifecycle: planned→purchased→installed→removed→sold/scrapped.';
comment on column public.jobs.session_id is 'NULL for Blueprint (planned) and Parts Bin (purchased) — no real-world event yet.';
comment on column public.jobs.car_id is 'Direct car FK for standalone jobs. Auto-populated via trigger when session_id is set.';
comment on column public.jobs.still_owned is 'True = user kept the removed part. Triggers creation of new Parts Bin entry automatically.';
comment on column public.jobs.cost_notes is 'Non-null = exclude from price aggregation. Use for free/sponsored/traded parts.';
comment on column public.jobs.brand is 'Manufacturer name. With part_number, forms the price aggregator lookup key.';
comment on column public.jobs.part_number is 'Catalog number. Future: brand+part_number used for market price aggregation.';
comment on column public.jobs.notes is 'Technical notes per job. Architecture flags this for future keyword search feature.';

-- =============================================================================
-- TRIGGER 1: Auto-populate car_id from session chain
-- =============================================================================

create or replace function public.jobs_set_car_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- When a session exists, derive car_id from it (single lookup)
  if new.session_id is not null then
    select s.car_id into new.car_id
    from public.sessions s
    where s.id = new.session_id;
  end if;

  -- Enforce the anchor constraint explicitly with a clear message
  if new.car_id is null then
    raise exception
      'Every job must have a car context. '
      'Either provide a session_id (car_id derived automatically) '
      'or provide car_id directly (for Blueprint/Parts Bin entries).';
  end if;

  return new;
end;
$$;

create trigger jobs_auto_car_id
  before insert on public.jobs
  for each row execute procedure public.jobs_set_car_id();

-- =============================================================================
-- TRIGGER 2: Removed + still_owned → auto-create Parts Bin entry
-- =============================================================================

create or replace function public.jobs_handle_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fires when: status changes to 'removed' from 'installed' AND user kept the part
  if new.status = 'removed'
    and old.status = 'installed'
    and new.still_owned = true then

    -- Create a new standalone Parts Bin entry inheriting the part's details
    insert into public.jobs (
      car_id,
      session_id,
      type,
      category,
      title,
      status,
      brand,
      part_number,
      cost,
      cost_currency,
      cost_notes,
      notes
    ) values (
      new.car_id,
      null,                     -- No session — it's back in the garage
      new.type,
      new.category,
      new.title,
      'purchased',              -- Owned and available for reinstall
      new.brand,
      new.part_number,
      new.cost,
      new.cost_currency,
      new.cost_notes,
      'Previously installed. Removed ' || coalesce(new.date_removed::text, 'recently') || '. Available for reinstall.'
    );

  end if;

  return new;
end;
$$;

-- Fires after the update so we can read both old and new values cleanly
create trigger jobs_removal_to_parts_bin
  after update of status on public.jobs
  for each row execute procedure public.jobs_handle_removal();

-- =============================================================================
-- INDEXES
-- =============================================================================

-- All jobs for a session (Session Detail view)
create index if not exists jobs_session_id
  on public.jobs (session_id)
  where session_id is not null;

-- Build Sheet: all installed jobs for a car (direct lookup via car_id)
create index if not exists jobs_car_installed
  on public.jobs (car_id, type, category, created_at desc)
  where status = 'installed';

-- Parts Bin: purchased/owned jobs per car
create index if not exists jobs_car_purchased
  on public.jobs (car_id, created_at desc)
  where status = 'purchased';

-- Blueprint: planned jobs per car
create index if not exists jobs_car_planned
  on public.jobs (car_id, created_at desc)
  where status = 'planned';

-- Removed parts still in possession (history + Parts Bin source)
create index if not exists jobs_car_removed_owned
  on public.jobs (car_id, date_removed desc)
  where status = 'removed' and still_owned = true;

-- Price aggregator partial index: real paid transactions only
-- Excludes $0 and annotated free/sponsored parts
create index if not exists jobs_price_aggregator
  on public.jobs (brand, part_number, cost)
  where status = 'installed'
    and cost > 0
    and cost_notes is null;

-- Future FTS on notes (deferred per architecture Part 27 — do not add yet):
-- ALTER TABLE jobs ADD COLUMN notes_tsv tsvector
--   GENERATED ALWAYS AS (to_tsvector('english', coalesce(notes, ''))) STORED;
-- CREATE INDEX jobs_notes_fts ON jobs USING GIN (notes_tsv);

-- =============================================================================
-- TRIGGER: updated_at
-- =============================================================================
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- RLS enabled here; policies in 015_rls_policies.sql
-- =============================================================================
alter table public.jobs enable row level security;
