-- =============================================================================
-- G-DIMENSION — Migration 039: username claim flag (onboarding)
-- =============================================================================
-- Adds a flag that marks whether a user has chosen their own handle, so new
-- signups can be routed through a one-time "claim your handle" screen while
-- existing users are left alone.
--
--   username_set = false  → auto-generated handle (email prefix); prompt to claim
--   username_set = true   → user has confirmed/chosen their handle
--
-- The signup trigger (handle_new_user) inserts without naming this column, so
-- new rows pick up the DEFAULT false and are gated. Existing rows are backfilled
-- to true below — nobody already using the app gets nagged.
--
-- The frontend gate reads this column defensively (fails open if it's missing),
-- so deploying the app before or after this migration is safe either way.
-- Idempotent.
-- =============================================================================

alter table public.users
  add column if not exists username_set boolean not null default false;

comment on column public.users.username_set is
  'True once the user has chosen/confirmed their own handle. New signups start false and are routed through the /welcome claim screen.';

-- Backfill: everyone who already exists keeps their current handle, no prompt.
update public.users set username_set = true where username_set = false;
