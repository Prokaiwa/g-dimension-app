-- =============================================================================
-- G-DIMENSION — Migration 045: timeline sync fix
-- =============================================================================
-- Fixes two live-DB problems that prevented ANY standard timeline entry from
-- ever being created, surfaced while building the Timeline destination:
--
-- 1. `sessions.title` (migration 033) was never actually applied to production
--    — the live DB raised `42703 column sessions.title does not exist` on the
--    Build Sheet's grouped-session query and on the Timeline title-enrichment
--    query. Re-applied idempotently here.
--
-- 2. The `sessions_timeline_sync` trigger (migration 007) used a bare
--    `on conflict (session_id) do nothing`, but the only unique index on
--    `timeline_entries.session_id` is PARTIAL
--    (`where session_id is not null and is_origin = false`). Postgres cannot
--    infer a partial index as the ON CONFLICT arbiter without the predicate, so
--    it raised `42P10 there is no unique or exclusion constraint matching the
--    ON CONFLICT specification` on EVERY `add_to_timeline = true` session
--    insert/update. The fix restates the index predicate in the conflict clause.
--
-- Function-only + idempotent column re-add. No data migration. Safe to run once.
-- =============================================================================

-- 1. Ensure migration 033's column is present. The live DB raised
--    `42703 column sessions.title does not exist` — which is either a genuinely
--    missing column OR a stale PostgREST schema cache (column present but unseen,
--    a known Supabase gotcha after DDL). `if not exists` is a no-op in the cache
--    case; the `notify` at the bottom forces a reload so PostgREST sees it either way.
alter table public.sessions add column if not exists title text;

-- 2. Recreate the timeline-sync trigger function with a conflict clause that
--    matches the partial unique index `timeline_entries_session_unique`.
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
    -- Restate the partial unique index predicate so Postgres can infer the
    -- arbiter (timeline_entries_session_unique). A bare `(session_id)` cannot
    -- match a partial index — that was the 42P10 bug.
    on conflict (session_id) where session_id is not null and is_origin = false
    do nothing;

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

-- 3. Force PostgREST to reload its schema cache, in case `sessions.title` was
--    already present but unseen (stale cache → the 42703 above). Harmless no-op
--    when the cache is already current.
notify pgrst, 'reload schema';
