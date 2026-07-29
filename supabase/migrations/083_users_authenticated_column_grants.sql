-- 083_users_authenticated_column_grants.sql
-- Closes the users-table email exposure to signed-in users (ADR-022).
--
-- THE HOLE: 071 fixed this for `anon` but explicitly left `authenticated`
-- alone, reasoning that an authenticated user "only reads their own profile".
-- That is true of the app's queries, but not of the database. `users` carries
-- TWO permissive select policies:
--
--   users_all_owner     for all    using (auth.uid() = id)
--   users_select_public for select using (deleted_at is null
--                                         and username is not null)
--
-- `users_select_public` has no role clause, so it applies to `authenticated`
-- too, and permissive policies are OR'd — every signed-in user matches EVERY
-- non-deleted row. 015's own comment concedes the column filtering is
-- "enforced at the app query layer", which is not a database guarantee. So
-- anyone who could sign up could read every user's `email` with one REST call:
--
--   GET /rest/v1/users?select=username,email
--
-- Verified live 2026-07-29 from a throwaway account: 28 rows, every real
-- address in the beta. Same class of bug as ADR-015 (anon) and ADR-020 (jobs):
-- a ROW policy cannot restrict COLUMNS.
--
-- THE FIX: the same column-level grant 071 applied to anon and 081 applied to
-- jobs, now for `authenticated` — every column EXCEPT `email`. Note the
-- ordering trap 081 documents: the `revoke` MUST come first, because a column
-- grant layered on a table-wide grant narrows nothing.
--
-- Why `email` can simply be dropped: `public.users.email` is a convenience
-- mirror of `auth.users.email`, and the ONLY consumer is the owner's own
-- Profile screen, which now reads it from `supabase.auth.getUser()` — the
-- canonical source, already in the session, no query needed. Nothing else in
-- the app, the edge functions, or api/* reads it. (The `delete-account` edge
-- function uses the service-role key, which bypasses grants entirely.)
--
-- Deliberately still readable by authenticated: `subscription_status` and the
-- display/preference columns. Free-vs-pro is surfaced as a badge on profiles
-- anyway, and the prefs are needed by the owner on every load; neither is PII.
-- Cross-user reads that legitimately need identity columns keep working:
-- car-transfer @handle lookup, the transfer/ghost sender-recipient embeds, DIY
-- authorship credit, and the username-availability check.
--
-- MAINTENANCE: like 071 for anon, this grant is now the single source of truth
-- for what a signed-in user can read off `users`. A new column added to the
-- table is NOT readable until it is added here — including by its own owner.
--
-- Idempotent. Run in the Supabase SQL editor.

revoke select on public.users from authenticated;

grant select (
  id, username, display_name, avatar_url,
  city, country, country_code, bio,
  subscription_status, license_grade,
  distance_unit, power_unit, torque_unit,
  spring_rate_unit, pressure_unit, temp_unit,
  active_car_id, username_set, tutorial_seen,
  sound_enabled, music_enabled,
  created_at, updated_at, deleted_at
) on public.users to authenticated;

notify pgrst, 'reload schema';
