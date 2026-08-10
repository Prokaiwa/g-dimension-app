-- 098_users_volume_unit_grant.sql
-- Make users.volume_unit readable by its own owner.
--
-- THE BUG THIS FIXES. Migration 097 added `users.volume_unit` and stopped there.
-- But 083 revoked the table-wide select on `public.users` from `authenticated`
-- and replaced it with a COLUMN-LEVEL grant, and its own header says the thing
-- that was then missed: "A new column added to the table is NOT readable until
-- it is added here — including by its own owner."
--
-- So every read of the column returned 42501, and the failure was invisible:
--
--   FuelPage.tsx      const { data: u } = await supabase.from('users')
--                       .select('volume_unit').eq('id', uid).single()
--                     setVUnit(asVolumeUnit(u?.volume_unit))
--
-- `asVolumeUnit(undefined)` is 'gal_us' by design, so a 403 and a US-gallons
-- user produce byte-identical output. The whole volume-unit feature was inert:
-- a litres user saw US gallons everywhere and nothing anywhere said why. Worse,
-- one ungranted column poisons the entire select, so any future query that
-- fetched volume_unit alongside active_car_id would have lost both.
--
-- WHY THIS IS A FULL RESTATEMENT rather than a one-line addition. 083 declared
-- itself "the single source of truth for what a signed-in user can read off
-- users", and that only stays true if there is exactly one place to look. A
-- bare `grant select (volume_unit)` would leave the real list spread across
-- three files (083, 084 and this one). So the complete set is restated here and
-- THIS migration is now that source of truth: 083's list, plus 084's two
-- suspension columns, plus volume_unit.
--
-- The revoke comes first, per the house rule (a column-level grant layered on a
-- table-wide one narrows nothing, and fails silently).
--
-- ONE CONSEQUENCE WORTH KNOWING, because it looks like a different bug. With no
-- table-wide select on `users`, a WRITE that asks for the row back fails too: an
-- `update(...).select()` — or a raw PostgREST `PATCH` carrying
-- `Prefer: return=representation` — makes the server SELECT every column of the
-- written row, hits the withheld ones, and returns `42501 permission denied for
-- table users`. The UPDATE privilege is fine; the echo is what is refused. So
-- always column-scope the select on a users write (ProfilePage does:
-- `.update(payload).eq(...).select(PROFILE_COLS)`), or ask for nothing back.
--
-- Idempotent. Run in the Supabase SQL Editor.

revoke select on public.users from authenticated;

grant select (
  id, username, display_name, avatar_url,
  city, country, country_code, bio,
  subscription_status, license_grade,
  distance_unit, power_unit, torque_unit,
  spring_rate_unit, pressure_unit, temp_unit,
  volume_unit,
  active_car_id, username_set, tutorial_seen,
  sound_enabled, music_enabled,
  suspended_at, suspension_reason,
  created_at, updated_at, deleted_at
) on public.users to authenticated;

notify pgrst, 'reload schema';
