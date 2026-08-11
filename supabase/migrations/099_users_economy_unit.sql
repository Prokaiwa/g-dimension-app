-- 099_users_economy_unit.sql
-- How fuel economy is spelled, which is not the same question as how fuel is sold.
--
-- 097 added `volume_unit` and the app then showed every user their economy in US
-- MPG regardless. That is incoherent the moment anyone picks litres: the sheet
-- asks for 45 L and the page answers 25.2 mpg. `src/lib/fuel.ts` has carried
-- `mpgToUnit`, `economyLabel` and `higherIsBetter` since the start, tested and
-- unused, waiting for this column.
--
-- WHY A COLUMN AND NOT A DERIVATION. Three of the four cases fall out of the
-- units a user has already set:
--
--   miles + US gallons     -> MPG (US)          the United States
--   miles + litres         -> MPG (imperial)    the UK: buys litres, thinks mpg
--   miles + imperial gal   -> MPG (imperial)
--   km    + litres         -> ???
--
-- The last one does not. Canada, Australia, New Zealand and most of Europe say
-- L/100km; Japan, India and much of Latin America say km/L. Same distance unit,
-- same volume unit, opposite conventions, and they are not just different scales
-- of each other: L/100km INVERTS which of two numbers is the better one, which
-- is why higherIsBetter() exists as a predicate rather than a comment. No
-- derivation can pick between them, so the user gets to.
--
-- NULL MEANS "DERIVE IT". The column is nullable and defaults to null on
-- purpose, so nobody has to answer a question about units before logging their
-- first tank: resolveEconomyUnit() falls back to the table above, and km+litres
-- lands on L/100km as the larger bloc. Setting it explicitly in
-- Settings > Units > Economy pins it. A default of 'mpg_us' would have been the
-- wrong shape — it cannot be told apart from a deliberate choice of US MPG, so
-- the derivation could never improve for anyone who had already loaded the app.
--
-- Idempotent. Run in the Supabase SQL Editor.


alter table public.users
  add column if not exists economy_unit text
    check (economy_unit is null or economy_unit in ('mpg_us', 'mpg_imp', 'l_100km', 'km_l'));

comment on column public.users.economy_unit is
  'Display unit for fuel economy. NULL = derive from distance_unit + volume_unit (see resolveEconomyUnit in src/lib/fuel.ts). Storage is always miles and US gallons; convert at display.';


-- =============================================================================
-- The column-level select grant on public.users
-- =============================================================================
-- Restated in full, for the same reason 098 restated it: 083 declared this grant
-- the single source of truth for what a signed-in user can read off `users`, and
-- that is only true if there is exactly one place to look. THIS migration is now
-- that place. The list is 098's, plus `economy_unit`.
--
-- The `revoke` comes first, per the house rule (a column-level grant layered on
-- a table-wide one narrows nothing, and fails silently).
--
-- Still deliberately absent: `email`. That is 083's security fix (ADR-022) and
-- it must stay absent.
--
-- Reminder, because it looks like a different bug: with no table-wide select
-- here, a WRITE that asks for the row back fails too. `update(...).select()` or
-- a PostgREST `PATCH` carrying `Prefer: return=representation` makes the server
-- SELECT every column of the written row, hits the withheld ones, and returns
-- 42501. Column-scope the select, or ask for nothing back.

revoke select on public.users from authenticated;

grant select (
  id, username, display_name, avatar_url,
  city, country, country_code, bio,
  subscription_status, license_grade,
  distance_unit, power_unit, torque_unit,
  spring_rate_unit, pressure_unit, temp_unit,
  volume_unit, economy_unit,
  active_car_id, username_set, tutorial_seen,
  sound_enabled, music_enabled,
  suspended_at, suspension_reason,
  created_at, updated_at, deleted_at
) on public.users to authenticated;

notify pgrst, 'reload schema';
