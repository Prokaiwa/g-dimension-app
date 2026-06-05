-- =============================================================================
-- G-DIMENSION — Migration 046: free-form Timeline entries ("notes") + title
-- =============================================================================
-- The Timeline is a build journal, not just a maintenance log. This adds a
-- `note` entry_type for free-form personal entries not tied to any session or
-- mod — a track day, a car show, the story of getting pulled over. These are
-- created directly from the Timeline ("+ Add Entry"), session_id = NULL.
--
-- Also adds `title` so a note carries a headline. Standard (session-derived)
-- entries leave it NULL and still derive their title from the session/jobs;
-- notes set it explicitly. Forward-compatible — future titled entries can use it.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- 1. Allow the new entry_type. Recreate the inline check constraint.
alter table public.timeline_entries
  drop constraint if exists timeline_entries_entry_type_check;

alter table public.timeline_entries
  add constraint timeline_entries_entry_type_check
  check (entry_type in ('origin','modification','maintenance','detail','note'));

-- 2. Headline for an entry (notes set it; session entries leave it NULL).
alter table public.timeline_entries
  add column if not exists title text;

-- 3. Refresh PostgREST's schema cache so the new column is visible to the API.
notify pgrst, 'reload schema';
