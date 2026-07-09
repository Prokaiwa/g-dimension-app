-- 068_sound_music_prefs.sql
-- Sound effects + background music toggles, promoted from localStorage-only
-- (device-local) to account-synced — mirroring users.active_car_id's pattern
-- (src/lib/activeCar.ts): the server column is the source of truth, localStorage
-- stays as an instant-load cache. Fixes a real bug: iOS Safari can clear
-- script-writable storage after a stretch of inactivity, silently resetting a
-- device-local toggle back to its default with no way to recover it except
-- noticing in Settings. Syncing to the account also means the preference now
-- correctly follows the user across devices, matching distance_unit/power_unit.
--
-- Defaults match the existing localStorage fallbacks in src/lib/sound.ts and
-- src/lib/music.ts (sound: default OFF: music: default ON), so existing users
-- get the same behavior they already had.
--
-- Idempotent. Run in the Supabase SQL editor.

alter table public.users add column if not exists sound_enabled boolean not null default false;
alter table public.users add column if not exists music_enabled boolean not null default true;

comment on column public.users.sound_enabled is
  'UI sound effects toggle. Account-synced (was localStorage-only); default OFF, matches src/lib/sound.ts.';
comment on column public.users.music_enabled is
  'Background music toggle. Account-synced (was localStorage-only); default ON, matches src/lib/music.ts.';

notify pgrst, 'reload schema';
