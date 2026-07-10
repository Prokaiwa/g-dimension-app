-- 071_users_anon_column_grants.sql
-- Closes the users-table anon column exposure (ADR-015).
--
-- THE HOLE: 027 granted blanket `select on public.users to anon`, and 015's
-- users_select_public row policy has no column restriction (its own comment
-- admits column filtering is "enforced at the app query layer" — which is not
-- a DB-level guarantee). Net effect: EVERY column of every non-deleted user
-- row — email, subscription_status, active_car_id, unit/sound prefs,
-- tutorial/username_set flags — was readable by anyone holding the public anon
-- key via a direct REST call to /rest/v1/users, no app involved.
--
-- THE FIX: Postgres column-level grants. Revoke the blanket anon SELECT and
-- re-grant only the deliberately-public identity columns (the same set the
-- public profile surfaces expose). The 015 row policy (deleted_at is null AND
-- username is not null) still gates WHICH rows; this now gates WHICH columns.
--
-- Verified safe against every consumer:
--   • Frontend: zero direct anon queries of `users` exist (all .from('users')
--     calls run authenticated — Welcome/Profile/Settings/libs are uid-scoped).
--   • authenticated role: untouched (keeps 027's full select + update — own
--     profile reads PROFILE_COLS incl. email, which stays fine).
--   • public_car_profiles view: executes with the view owner's privileges
--     (created without security_invoker), so anon reads of the view are
--     unaffected by these grants.
--   • api/og.js + api/sitemap-builds.js (anon key, server-side): query only
--     public_car_profiles, never users.
--   • RLS policy expressions don't require column privileges — the policy's
--     deleted_at/username references keep working.
--
-- Idempotent. Run in the Supabase SQL editor.

revoke select on public.users from anon;
grant select (id, username, display_name, avatar_url, city, country, country_code, bio, created_at)
  on public.users to anon;

notify pgrst, 'reload schema';
