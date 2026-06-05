-- =============================================================================
-- G-DIMENSION — Migration 048: session timeline title
-- =============================================================================
-- Session-derived Timeline cards (mods, service, detail) can now carry a custom
-- Timeline title + story, distinct from the dry mod/service record. The story
-- already had a home (sessions.journal_entry, copied by the sync trigger); this
-- adds sessions.timeline_title and teaches the trigger to copy it onto
-- timeline_entries.title.
--
-- The Timeline card + Entry Detail already read timeline_entries.title first
-- (it's how notes work), so no frontend rendering changes are needed — an empty
-- timeline_title just leaves title NULL and the card falls back to the derived
-- name (mod / group / job count).
--
-- Storing the title on the session (rather than only on timeline_entries) makes
-- it survive toggling Add-to-Timeline off and back on, exactly like the story.
--
-- Function-only + idempotent column add. Run once in the Supabase SQL editor.
-- =============================================================================

alter table public.sessions add column if not exists timeline_title text;

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
      title, photo_url, journal_entry, display_date
    )
    values (
      new.car_id,
      new.id,
      new.type,
      false,
      new.timeline_title,
      new.timeline_photo_url,
      new.journal_entry,
      new.date_performed
    )
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
    set title         = new.timeline_title,
        photo_url     = new.timeline_photo_url,
        journal_entry = new.journal_entry,
        display_date  = new.date_performed,
        updated_at    = now()
    where session_id = new.id
      and is_origin = false;

  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
