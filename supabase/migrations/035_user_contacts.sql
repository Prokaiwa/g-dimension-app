-- =============================================================================
-- G-DIMENSION — Migration 035: user_contacts
-- =============================================================================
-- A per-USER contact book (not per-car). Insurance agent, dealership, roadside
-- assistance, a trusted mechanic — these belong to the owner, not a single car,
-- so they shouldn't be re-entered for every car in the garage.
--
-- This supersedes the per-car car_contacts table (010) for the Contacts screen.
-- car_contacts is left in place (unused by the app) rather than dropped, to
-- avoid destructive changes; it can be removed in a later cleanup migration.
--
-- New-table grant rule (post-2026-05-30): explicit PostgREST grant required.
-- =============================================================================

create table if not exists public.user_contacts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,

  label           text not null,          -- e.g. "Mechanic", "Insurance", "Dealership"
  name            text,
  phone           text,
  email           text,
  website         text,
  notes           text,
  display_order   integer not null default 0,

  created_at      timestamptz not null default now()
);

comment on table public.user_contacts is 'Per-user contact book (cross-car). Mechanic, insurance, dealership, roadside, etc.';

create index if not exists user_contacts_user_id
  on public.user_contacts (user_id, display_order asc);

alter table public.user_contacts enable row level security;

create policy "user_contacts_all_owner"
  on public.user_contacts
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.user_contacts to authenticated;
