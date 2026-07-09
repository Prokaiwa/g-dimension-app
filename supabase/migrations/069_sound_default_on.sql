-- 069_sound_default_on.sql
-- Flips users.sound_enabled's default from false to true, matching
-- users.music_enabled — both are ambient in-app audio and should behave the
-- same way on first launch (music already defaulted ON).
--
-- Also backfills existing rows to true. This is safe as a blanket backfill
-- (unlike 062_tutorial_seen, which deliberately did NOT backfill so existing
-- users would still see the tour): migration 068 — the account-sync feature
-- itself — landed only minutes before this flip, so no user has had a real
-- chance to make a considered choice via the new synced toggle yet. There is
-- no meaningful "explicit off" to accidentally overwrite.
--
-- Idempotent. Run in the Supabase SQL editor.

alter table public.users alter column sound_enabled set default true;
update public.users set sound_enabled = true where sound_enabled = false;

comment on column public.users.sound_enabled is
  'UI sound effects toggle. Account-synced (was localStorage-only); default ON (069), matches src/lib/sound.ts and users.music_enabled.';

notify pgrst, 'reload schema';
