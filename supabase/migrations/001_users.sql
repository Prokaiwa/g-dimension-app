-- =============================================================================
-- G-DIMENSION — Migration 001: users
-- =============================================================================
-- The users table is the root of the entire data graph. Every car, session,
-- job, photo, and document traces back to a user row. This table extends
-- auth.users (managed by Supabase Auth) with app-level profile data and
-- unit preferences. The id column is a 1:1 match with auth.users.id — not a
-- separate primary key — so the auth layer and the app layer are always in sync.
--
-- UNIT STORAGE PHILOSOPHY (Part 16 of Master Architecture):
--   All numeric data is stored in base units:
--     Distance → miles    (displayed as mi or km)
--     Power    → hp       (displayed as hp, PS, or kW)
--     Torque   → lb-ft    (displayed as lb-ft or Nm)
--   Conversion happens at the display layer only. Switching units requires
--   no data migration, ever.
-- =============================================================================

create table if not exists public.users (
  -- Identity — mirrors auth.users.id exactly (not gen_random_uuid())
  id                  uuid primary key references auth.users(id) on delete cascade,

  -- Profile
  username            text unique not null,
  email               text unique not null,
  avatar_url          text,
  display_name        text,
  city                text,
  country             text,
  country_code        char(2),
  bio                 text,

  -- Monetization (Part 20)
  subscription_status text not null
                        check (subscription_status in ('free','pro'))
                        default 'free',

  -- Unit preferences (Part 16) — stored as the user's display preference,
  -- NOT as the storage unit. Storage is always base units in cars.*
  distance_unit       text not null
                        check (distance_unit in ('mi','km'))
                        default 'mi',
  power_unit          text not null
                        check (power_unit in ('hp','ps','kw'))
                        default 'hp',
  torque_unit         text not null
                        check (torque_unit in ('lbft','nm'))
                        default 'lbft',

  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Soft delete (reserved — account deletion feature, future)
  deleted_at          timestamptz
);

comment on table  public.users is 'App-level user profiles. Extends auth.users 1:1.';
comment on column public.users.id is 'Matches auth.users.id exactly — not a surrogate key.';
comment on column public.users.subscription_status is 'free or pro. Governs feature gating (Part 20).';
comment on column public.users.distance_unit is 'User display preference. Data always stored in miles.';
comment on column public.users.power_unit is 'User display preference. Data always stored in hp.';
comment on column public.users.torque_unit is 'User display preference. Data always stored in lb-ft.';

-- =============================================================================
-- TRIGGER: Auto-create user profile row on auth signup
-- When Supabase Auth creates a new user, this function fires and inserts a
-- matching row into public.users. Email is pulled from auth.users.email.
-- Username defaults to email prefix (editable post-signup in profile).
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, username, display_name)
  values (
    new.id,
    new.email,
    -- Default username: email prefix, lowercased, non-alphanumeric stripped
    -- Users should be prompted to set a real username post-signup
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g')),
    -- If Google/Apple OAuth provides a name, use it. Otherwise null.
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Attach trigger to auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- TRIGGER: Keep updated_at current
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- RLS: Enabled here; policies written in 015_rls_policies.sql
-- =============================================================================
alter table public.users enable row level security;
