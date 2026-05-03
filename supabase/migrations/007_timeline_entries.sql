-- =============================================================================
-- G-DIMENSION — Migration 007: timeline_entries
-- =============================================================================
-- The curated story of a car's life. The Timeline destination reads from this
-- table exclusively — not from sessions or jobs directly.
--
-- TWO ENTRY TYPES:
--
-- 1. ORIGIN ENTRY (is_origin = true, session_id = NULL):
--    - Created when the user first opens Timeline after adding a car
--    - photo_url = the day-one photo uploaded during Origin Entry prompt
--    - journal_entry = pre-populated from cars.purchase_story
--    - display_date = cars.purchase_date (or manual override)
--    - CANNOT BE DELETED — only edited via long-press (Part 27)
--    - One per car, always the first entry in the scroll
--
-- 2. STANDARD ENTRIES (is_origin = false, session_id = sessions.id):
--    - Created automatically when sessions.add_to_timeline = true
--    - photo_url = sessions.timeline_photo_url (the hero photo)
--    - journal_entry = sessions.journal_entry
--    - display_date = sessions.date_performed
--    - Deleted if the parent session is deleted (cascade)
--
-- PUBLIC VISIBILITY:
--    Timeline entries inherit visibility from cars.is_public.
--    A public car's timeline is readable by anon users at /builds/:username.
--    RLS policy enforces this (see 015_rls_policies.sql).
-- =============================================================================

-- Require btree_gist for the exclude constraint above
create extension if not exists btree_gist;

-- =============================================================================
-- TABLE
-- =============================================================================

create table if not exists public.timeline_entries (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid not null references public.cars(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete cascade,
  -- NULL for Origin Entry; populated for all standard entries

  -- Classification
  entry_type    text not null
                  check (entry_type in ('origin','modification','maintenance','detail')),
  is_origin     boolean not null default false,

  -- Content
  photo_url     text,               -- Hero photo for this Timeline card
  journal_entry text,               -- Full personal note (Cormorant Garamond)
  display_date  date not null,      -- Date shown on the card (may differ from created_at)

  -- Timestamps
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Only one Origin Entry per car (requires btree_gist extension — loaded in 003)
  constraint timeline_entries_one_origin_per_car
    exclude (car_id with =) where (is_origin = true)
);

comment on table  public.timeline_entries is 'Curated build story. Origin Entry + sessions where add_to_timeline=true.';
comment on column public.timeline_entries.session_id is 'NULL for Origin Entry. Populated for all standard entries.';
comment on column public.timeline_entries.is_origin is 'True for the single Origin Entry per car. Cannot be deleted.';
comment on column public.timeline_entries.display_date is 'Date shown on Timeline card. Standard entries: sessions.date_performed.';
comment on column public.timeline_entries.journal_entry is 'Rendered in Cormorant Garamond italic on Timeline cards.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Timeline scroll: all entries for a car, oldest first (Origin Entry at top)
create index if not exists timeline_entries_car_date
  on public.timeline_entries (car_id, display_date asc);

-- Origin Entry lookup (checked once when Timeline opens)
create index if not exists timeline_entries_origin
  on public.timeline_entries (car_id)
  where is_origin = true;

-- Session → entry lookup
create index if not exists timeline_entries_session_id
  on public.timeline_entries (session_id)
  where session_id is not null;

-- =============================================================================
-- UNIQUE INDEX: one timeline entry per session
-- This is what makes the ON CONFLICT clause in the trigger actually work.
-- Without this, the conflict safety net is a no-op and a trigger bug could
-- produce duplicate entries for the same session. With this index, any
-- attempt to insert a second entry for the same session is caught and
-- suppressed cleanly via ON CONFLICT (session_id) DO NOTHING.
-- Only applies to non-origin entries (session_id is not null).
-- =============================================================================

create unique index if not exists timeline_entries_session_unique
  on public.timeline_entries (session_id)
  where session_id is not null and is_origin = false;

-- =============================================================================
-- TRIGGER: Auto-create / update / remove timeline_entry
-- Fires AFTER INSERT or UPDATE on sessions.
-- =============================================================================

create or replace function public.handle_timeline_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  -- Branch 1: new session with timeline ON, or toggle from OFF → ON
  if (TG_OP = 'INSERT' and new.add_to_timeline = true) or
     (TG_OP = 'UPDATE' and new.add_to_timeline = true
      and (old.add_to_timeline = false or old.add_to_timeline is null)) then

    insert into public.timeline_entries (
      car_id, session_id, entry_type, is_origin,
      photo_url, journal_entry, display_date
    )
    values (
      new.car_id,
      new.id,
      new.type,
      false,
      new.timeline_photo_url,
      new.journal_entry,
      new.date_performed
    )
    -- session_id unique index makes this conflict clause functional
    on conflict (session_id) do nothing;

  -- Branch 2: toggle from ON → OFF — remove the entry
  elsif TG_OP = 'UPDATE'
    and new.add_to_timeline = false
    and old.add_to_timeline = true then

    delete from public.timeline_entries
    where session_id = new.id
      and is_origin = false;

  -- Branch 3: session updated while timeline still ON — keep entry in sync
  elsif TG_OP = 'UPDATE'
    and new.add_to_timeline = true
    and old.add_to_timeline = true then

    update public.timeline_entries
    set photo_url     = new.timeline_photo_url,
        journal_entry = new.journal_entry,
        display_date  = new.date_performed,
        updated_at    = now()
    where session_id = new.id
      and is_origin = false;

  end if;

  return new;
end;
$$;

create trigger sessions_timeline_sync
  after insert or update on public.sessions
  for each row execute procedure public.handle_timeline_entry();

-- =============================================================================
-- TRIGGER: updated_at
-- =============================================================================
create trigger timeline_entries_set_updated_at
  before update on public.timeline_entries
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- RLS enabled here; policies written in 015_rls_policies.sql
-- =============================================================================
alter table public.timeline_entries enable row level security;
