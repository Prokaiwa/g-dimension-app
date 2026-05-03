-- =============================================================================
-- G-DIMENSION — Migration 009: receipts
-- =============================================================================
-- Financial records attached to sessions or specific jobs within a session.
-- A receipt can be attached at two levels:
--   Session level (session_id only, job_id null): e.g. shop invoice covering
--     multiple jobs — one receipt for the whole visit.
--   Job level (both session_id and job_id): e.g. parts receipt for a specific
--     part purchased. job_id is set to null on job deletion (on delete set null).
--
-- Stored in the `receipts` Storage bucket (image + PDF support).
-- The Snapshot screen shows total logged spend from receipts (Part 15).
--
-- FORWARD-LOOKING — BUILD INVESTMENT TOTAL:
--   Total spend query: SELECT SUM(amount) FROM receipts WHERE session_id IN
--   (SELECT id FROM sessions WHERE car_id = $1)
--   This gives the "Build Investment" figure shown in Snapshot.
--   The currency column enables multi-currency builds (JDM import builds
--   may have mix of JPY parts receipts and USD labor receipts).
-- =============================================================================

create table if not exists public.receipts (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete set null,
  -- job_id = null means receipt covers the whole session (or session-level invoice)

  -- Denormalized for query performance (same pattern as job_photos)
  car_id          uuid not null references public.cars(id) on delete cascade,

  -- File
  file_url        text not null,      -- Storage URL in receipts bucket
  file_type       text not null
                    check (file_type in ('image','pdf')),
  file_name       text,               -- Original filename for display

  -- Financial data
  amount          decimal(10,2),      -- Optional — user may skip entering amount
  currency        char(3) default 'USD',  -- ISO 4217 — JPY for JDM parts, etc.
  vendor          text,               -- Shop name, parts vendor, retailer
  receipt_date    date,               -- Date on the receipt (may differ from session date)

  -- Timestamps
  created_at      timestamptz not null default now()
);

comment on table  public.receipts is 'Financial records (images + PDFs) attached to sessions or jobs.';
comment on column public.receipts.job_id is 'NULL = session-level receipt. SET NULL on job deletion. Never cascade-deletes.';
comment on column public.receipts.car_id is 'Denormalized for Build Investment total query performance.';
comment on column public.receipts.currency is 'ISO 4217. USD default. JPY for JDM parts, EUR for EU imports.';

-- =============================================================================
-- TRIGGER: Auto-populate car_id from session on insert
-- =============================================================================

create or replace function public.receipts_set_car_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select car_id into new.car_id
  from public.sessions
  where id = new.session_id;

  if new.car_id is null then
    raise exception 'receipts: session % not found or has no car_id', new.session_id;
  end if;

  return new;
end;
$$;

create trigger receipts_auto_car_id
  before insert on public.receipts
  for each row execute procedure public.receipts_set_car_id();

-- =============================================================================
-- INDEXES
-- =============================================================================

-- All receipts for a car (Build Investment total, Snapshot)
create index if not exists receipts_car_id
  on public.receipts (car_id);

-- Receipts for a session (Session Detail view)
create index if not exists receipts_session_id
  on public.receipts (session_id);

-- Receipts for a specific job
create index if not exists receipts_job_id
  on public.receipts (job_id)
  where job_id is not null;

-- =============================================================================
-- RLS enabled here; policies in 015_rls_policies.sql
-- =============================================================================
alter table public.receipts enable row level security;
