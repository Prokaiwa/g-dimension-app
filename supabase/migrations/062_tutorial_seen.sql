-- 062_tutorial_seen.sql
-- Onboarding tour completion flag. New signups start false → the guided
-- home-map tour auto-starts once (after the handle claim). Replayable from
-- Settings (resets this to false). Mirrors the username_set onboarding flag.
--
-- Existing users are intentionally NOT backfilled to true: pre-beta we want the
-- tour to appear for current accounts too. Flip to a backfill if that changes.
--
-- Idempotent. Run in the Supabase SQL editor.

alter table public.users add column if not exists tutorial_seen boolean not null default false;

comment on column public.users.tutorial_seen is
  'Onboarding tour completion flag. False for new signups → guided home-map tour auto-starts once after handle claim. Replayable from Settings.';

notify pgrst, 'reload schema';
