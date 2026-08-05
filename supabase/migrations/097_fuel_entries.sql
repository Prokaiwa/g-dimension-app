-- 097_fuel_entries.sql
-- Fuel logging, and the volume unit it needs (ADR-033).
--
-- Two motivations, and the second is the one that actually drives the schema.
--
-- Externally: fuel is the single biggest feature gap against every competitor in
-- the category (docs/STORE_LISTING.md §5) and the most-searched term in it.
--
-- Internally: it is the only realistic way to keep `cars.current_mileage` fresh.
-- `urgencyOf()` in GarageRemindersPage reads that number, and when it is null a
-- mileage reminder never bumps past `upcoming` — it prints "at 90,000 mi" and
-- its telltale stays dark. Stale-but-present is worse: it prints a confident
-- "in 3,000 mi" from a months-old reading. Today the odometer is only written
-- from the car edit form and from four opt-in checkboxes buried mid-form (the
-- migration 041 pattern, in TuningAddPage, TuningPartDetailPage,
-- MaintenanceServiceNewPage and MaintenanceServiceEditPage), all of which fire
-- only when a mod or a service is logged. That is a few times a year. A fill-up
-- is every ten days.
--
-- WHY VOLUME IS NULLABLE. The odometer is the point; the gallons are the bonus.
-- An entry with a reading and nothing else is a valid, useful record, and
-- refusing it would trade the whole internal motivation for a tidier table.
--
-- WHY is_full AND is_missed BOTH EXIST. Economy is not a property of a fill-up.
-- It is computed BETWEEN two FULL fills: distance travelled, divided by the fuel
-- added at the second. Both flags break that chain and they break it for
-- different reasons, so one boolean cannot carry both:
--   is_full = false  → a partial fill. Volume accumulates toward the next full
--                      one; no figure is produced for this tank.
--   is_missed = true → the chain itself is broken (a fill-up that was never
--                      logged). Distance since the last record is real but the
--                      fuel is not, so the next full tank must start fresh
--                      rather than divide by a number that is missing a tank.
-- Without the second flag a forgotten fill-up silently halves the reported
-- economy of the tank after it. See docs/FUEL_LOG_RESEARCH.md §2.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. users.volume_unit
-- =============================================================================
-- `users` already carries distance_unit, power_unit and torque_unit; volume is
-- the missing fourth. It cannot be folded into distance_unit: US and imperial
-- gallons differ by about 20%, so "gallons" is not one unit, and a UK user shown
-- US gallons gets a wrong number rather than an unfamiliar one.
--
-- Volume is STORED IN US GALLONS and converted at display, matching the rule the
-- rest of the app already follows for miles, hp and lb-ft.

alter table public.users
  add column if not exists volume_unit text not null default 'gal_us'
    check (volume_unit in ('gal_us', 'gal_imp', 'l'));

comment on column public.users.volume_unit is
  'Display unit for fuel volume. Storage is ALWAYS US gallons; convert at display.';


-- =============================================================================
-- 2. fuel_entries
-- =============================================================================

create table if not exists public.fuel_entries (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,

  filled_on   date not null,
  -- Stored in MILES, like cars.current_mileage and sessions.mileage. Not null:
  -- an entry without a reading can produce no distance and no economy, and it
  -- would not serve the reason this table exists.
  odometer    integer not null check (odometer >= 0),

  -- Always US gallons. Null means "odometer only", which is a first-class case.
  volume      numeric(8,3) check (volume is null or volume > 0),
  total_cost  numeric(10,2) check (total_cost is null or total_cost >= 0),

  is_full     boolean not null default true,
  is_missed   boolean not null default false,

  fuel_type   text,
  station     text,
  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.fuel_entries.odometer is
  'Always stored in miles. Convert at display using cars.mileage_unit.';
comment on column public.fuel_entries.volume is
  'Always stored in US gallons. Convert at display using users.volume_unit.';
comment on column public.fuel_entries.is_full is
  'False = partial fill. Volume accumulates toward the next full tank; this tank yields no economy figure.';
comment on column public.fuel_entries.is_missed is
  'True = a fill-up happened that was never logged, so the chain is broken and the next full tank starts a new one.';

-- The economy chain is always read as one car ordered by odometer, so that is
-- the index. filled_on is secondary because two entries can share a date and
-- the odometer is what actually orders them.
create index if not exists fuel_entries_car_odo
  on public.fuel_entries (car_id, odometer desc);
create index if not exists fuel_entries_car_date
  on public.fuel_entries (car_id, filled_on desc);

alter table public.fuel_entries enable row level security;

-- Ownership is checked through the CAR, not just the denormalised user_id, so a
-- forged user_id on insert cannot attach an entry to someone else's car. The
-- column exists for cheap filtering and for the on-delete cascade, not as the
-- authority.
drop policy if exists "fuel_entries_owner_all" on public.fuel_entries;
create policy "fuel_entries_owner_all"
  on public.fuel_entries for all to authenticated
  using (car_id in (select cars.id from cars
                    where cars.user_id = (select auth.uid())))
  with check (car_id in (select cars.id from cars
                         where cars.user_id = (select auth.uid())));

-- Supabase stopped auto-granting on new public tables (2026-05-30), and
-- PostgREST checks grants BEFORE RLS, so a missing grant means a perfectly
-- correct policy never runs and the client sees 42501 naming the table.
--
-- The revoke comes first. A column-level grant layered on a table-wide one
-- narrows nothing (migrations 071, 081 and 083 each exist to fix a version of
-- that), and it fails silently: the grant looks restrictive and the table stays
-- wide open.
revoke all on public.fuel_entries from authenticated, anon;
grant select, insert, update, delete on public.fuel_entries to authenticated;

-- Deliberately NO anon grant. Fuel spend is not part of the public profile
-- boundary: /builds/* publishes identity, specs, timeline, photos and the build
-- sheet, and cost has never been in that set.
