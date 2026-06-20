-- =============================================================================
-- G-DIMENSION — Migration 056: us_manual source tag + US muscle-car backfill
-- =============================================================================
-- The NHTSA seed only covers modern-era models, so classic US muscle was largely
-- missing (Dodge had no Charger/Challenger at all). This migration:
--   1. Adds 'us_manual' to the vehicle_models.source CHECK (mirrors jdm_manual /
--      eu_manual) so curated US rows stay distinguishable from pulled NHTSA data.
--   2. Removes NHTSA name-collision / commercial junk under Chevrolet, Ford, Shelby.
--   3. Backfills missing muscle/classic nameplates at FAMILY level. Trims (SS, R/T,
--      Boss, Mach 1, Super Bee, Demon, GT500) live on the car, not as model rows.
-- Additive + idempotent. Safe to re-run.
-- =============================================================================

-- 1) Allow the us_manual source tag -------------------------------------------
alter table public.vehicle_models drop constraint if exists vehicle_models_source_check;
alter table public.vehicle_models add constraint vehicle_models_source_check
  check (source = any (array[
    'nhtsa',
    'carquery',
    'jdm_manual',
    'eu_manual',
    'us_manual',
    'user_added'
  ]));

-- 2) Remove commercial/chassis + trailer junk (by make + name, environment-portable)
delete from public.vehicle_models
where make_id = (select id from public.vehicle_makes where make_name = 'CHEVROLET')
  and model_name in (
    'Bolt Incomplete','Bus Chassis','Cutaway Chassis','Cutaway Van',
    'Hearse/Limo','Hearse/Limo Commercial Chassis','Motorhome Chassis'
  );

delete from public.vehicle_models
where make_id = (select id from public.vehicle_makes where make_name = 'FORD')
  and model_name = 'Waterford Tank and Fabrication, LTD';

-- Shelby: keep the Cobra (a true standalone Shelby American); drop the vague
-- Mustang-based rows (covered by Ford -> Mustang + Shelby trim).
delete from public.vehicle_models
where make_id = (select id from public.vehicle_makes where make_name = 'SHELBY')
  and model_name in ('GT','Shelby');

-- 3) Backfill muscle / classic nameplates (idempotent: skip if name already exists)
insert into public.vehicle_models (make_id, model_name, year_start, year_end, source, is_jdm_only)
select v.make_id, v.model_name, v.year_start, v.year_end, 'us_manual', false
from (values
  -- Ford (make_id 4090)
  (4090, 'Torino',     1968, 1976),
  (4090, 'Fairlane',   1955, 1970),
  (4090, 'Falcon',     1960, 1970),
  (4090, 'Galaxie',    1959, 1974),
  (4090, 'Ranchero',   1957, 1979),
  -- Chevrolet (make_id 2134)
  (2134, 'Chevelle',   1964, 1977),
  (2134, 'Bel Air',    1953, 1975),
  (2134, 'Biscayne',   1958, 1972),
  (2134, 'Nomad',      1955, 1961),
  (2134, 'Chevy II',   1962, 1968),
  -- Dodge (make_id 3108)
  (3108, 'Charger',    1966, 2023),
  (3108, 'Challenger', 1970, 2023),
  (3108, 'Dart',       1960, 2016),
  (3108, 'Coronet',    1949, 1976),
  (3108, 'Polara',     1960, 1973),
  (3108, 'Viper',      1992, 2017),
  (3108, 'Magnum',     1978, 2008),
  (3108, 'Daytona',    1984, 1993)
) as v(make_id, model_name, year_start, year_end)
where not exists (
  select 1 from public.vehicle_models m
  where m.make_id = v.make_id and m.model_name = v.model_name
);
