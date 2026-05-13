-- =============================================================================
-- G-DIMENSION — Migration 027: active_car_id on users
-- =============================================================================
-- Stores the user's chosen car server-side so it persists across devices
-- and browsers. Previously stored only in localStorage (origin-scoped).
--
-- ON DELETE SET NULL: if the car is archived/deleted, fall back to any car.
-- =============================================================================

alter table public.users
  add column if not exists active_car_id uuid
    references public.cars(id) on delete set null;

comment on column public.users.active_car_id is
  'The car the user has selected as active. Synced to localStorage on login so every device uses the same car.';

-- The authenticated role needs explicit SELECT + UPDATE on users.
-- Without these, RLS policies are irrelevant — PostgreSQL checks privileges first.
-- anon needs SELECT for public profile pages (/builds/:username).
grant select, update on public.users to authenticated;
grant select            on public.users to anon;
