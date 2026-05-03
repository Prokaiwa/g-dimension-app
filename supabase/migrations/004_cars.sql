-- =============================================================================
-- G-DIMENSION — Migration 004: cars
-- =============================================================================
-- The central entity of G-Dimension. Everything — sessions, jobs, photos,
-- documents, contacts, reminders — hangs off a car row. A user can have
-- multiple cars (1 free, unlimited Pro — Part 20).
--
-- UNIT STORAGE (Part 16 — Non-negotiable):
--   horsepower        → stored in hp      (convert at display per users.power_unit)
--   torque            → stored in lb-ft   (convert at display per users.torque_unit)
--   current_mileage   → stored in miles   (convert at display per users.distance_unit)
--   mileage_at_purchase → stored in miles
--
-- SOFT DELETE (Part 27):
--   deleted_at is set on delete. A nightly cron purges rows where
--   deleted_at < now() - interval '7 days'. Users have a 7-day recovery window.
--   All queries MUST filter `where deleted_at is null` to exclude soft-deleted cars.
--   The partial index `cars_user_id_active` handles this efficiently.
--
-- MAKE/MODEL STORAGE:
--   make and model are stored as free text (not FK references) so users can
--   enter JDM-only or rare vehicles not in the NHTSA reference tables.
--   The autocomplete in Add Car suggests from vehicle_makes/vehicle_models but
--   the stored value is always the text name (Part 24).
--
-- FORWARD-LOOKING:
--   - `make_id` and `model_id` nullable FKs to reference tables added now.
--     When set, they enable price aggregation and marketplace provenance.
--     When null (manual entry), the free-text make/model fields are used.
--   - `is_import` flag for JDM/EU imports — surfaces in UI and future
--     marketplace ("imported from Japan, full documentation").
-- =============================================================================

create table if not exists public.cars (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,

  -- Vehicle Identity
  year                integer,
  make                text,               -- Free text. May match vehicle_makes.make_name.
  model               text,               -- Free text. May match vehicle_models.model_name.
  trim                text,
  nickname            text not null,      -- Required. User's name for the car.
  color               text,

  -- Optional FK references to normalized reference tables
  -- Null = manual entry (free text make/model used instead)
  make_id             integer references public.vehicle_makes(id) on delete set null,
  model_id            integer references public.vehicle_models(id) on delete set null,
  is_import           boolean not null default false,  -- JDM/EU import flag

  -- Documentation
  vin                 text,
  paint_code          text,
  license_plate       text,

  -- Powertrain
  engine_type         text,
  transmission        text check (transmission in ('manual','automatic','sequential','cvt','other')),
  drivetrain          text check (drivetrain in ('rwd','fwd','awd','4wd')),
  forced_induction    text check (forced_induction in ('none','turbo','supercharged','twin-turbo','e-boost','other'))
                        default 'none',

  -- Performance specs — ALL STORED IN BASE UNITS (see header above)
  horsepower          integer,            -- stored in hp
  torque              integer,            -- stored in lb-ft
  current_mileage     integer,            -- stored in miles

  -- Consumables
  tire_size           text,
  oil_type            text,
  battery_model       text,

  -- Purchase / Origin (Part 15)
  purchase_date       date,
  purchase_price      decimal(10,2),
  purchase_currency   char(3) default 'USD',  -- ISO 4217. Forward-looking for import cars.
  mileage_at_purchase integer,            -- stored in miles
  purchase_dealer     text,
  purchase_story      text,               -- Auto-populates Origin Entry journal

  -- Notes
  notes               text,

  -- Photos (Part 14 — garage_photo_url reused in Maintenance compositing)
  garage_photo_url    text,               -- Background-removed via Remove.bg pipeline
  showcase_photo_url  text,               -- Second hero photo
  photo_y_offset      integer not null default 50
                        check (photo_y_offset between 0 and 100),

  -- Visibility
  is_public           boolean not null default true,

  -- Timestamps
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Soft delete (7-day recovery window — Part 27)
  deleted_at          timestamptz
);

comment on table  public.cars is 'Core entity. All sessions, jobs, photos, and documents belong to a car.';
comment on column public.cars.horsepower is 'Always stored in hp. Convert at display using users.power_unit.';
comment on column public.cars.torque is 'Always stored in lb-ft. Convert at display using users.torque_unit.';
comment on column public.cars.current_mileage is 'Always stored in miles. Convert at display using users.distance_unit.';
comment on column public.cars.purchase_currency is 'ISO 4217. Default USD. Use JPY for JDM imports, EUR for EU imports.';
comment on column public.cars.garage_photo_url is 'Background-removed via Remove.bg. Reused in Maintenance GT-Auto compositing.';
comment on column public.cars.is_import is 'True for JDM/EU market vehicles. Surfaces import badge and affects price aggregator.';
comment on column public.cars.deleted_at is '7-day soft delete. Nightly cron purges rows older than 7 days.';

-- =============================================================================
-- INDEXES (critical — see also 016_indexes.sql for full set)
-- =============================================================================

-- Primary query: all active cars for a user (Garage dashboard, car switcher)
create index if not exists cars_user_id_active
  on public.cars (user_id)
  where deleted_at is null;

-- Public profile queries
create index if not exists cars_public_active
  on public.cars (user_id, is_public)
  where deleted_at is null and is_public = true;

-- Soft-delete purge cron query
create index if not exists cars_deleted_at
  on public.cars (deleted_at)
  where deleted_at is not null;

-- =============================================================================
-- TRIGGER: updated_at
-- =============================================================================
create trigger cars_set_updated_at
  before update on public.cars
  for each row execute procedure public.set_updated_at();

-- =============================================================================
-- RLS enabled here; policies in 015_rls_policies.sql
-- =============================================================================
alter table public.cars enable row level security;
