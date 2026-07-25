-- =============================================================================
-- G-DIMENSION — Migration 079: Infiniti make + model backfill
-- =============================================================================
-- The NHTSA/CarQuery seed shipped without Infiniti (Nissan's luxury division),
-- so the make was absent from vehicle_makes and every Infiniti nameplate was
-- missing from vehicle_models. This adds the make and its US-market lineup.
--
--   1. Adds 'us_manual' to the vehicle_makes.source CHECK — mirrors what 056 did
--      for vehicle_models.source, so a curated manual make stays distinguishable
--      from pulled NHTSA/CarQuery data. (country = 'JP' still records the
--      manufacturer's nationality; source records how the ROW got into our DB.)
--   2. Inserts the INFINITI make (idempotent via the make_name unique key).
--      Each Infiniti nameplate is its own row — the number IS the engine badge
--      (FX35 vs FX37 vs FX45 vs FX50), so they're distinct models, not one
--      family with a typed suffix. The car's `variant` free-text field
--      (migration 044) is for trim (Sport, etc.), not the badge. Additive +
--      idempotent. Safe to re-run.
--
-- DEPENDENCY / IMPACT (per DB change protocol):
--   - vehicle_makes created in 002; source CHECK is the only constraint touched.
--     No trigger/view/function keys on source values. make_name unique (002)
--     drives the ON CONFLICT no-op.
--   - vehicle_models created in 003; make_id FK → vehicle_makes (insert make
--     first). source CHECK already allows 'us_manual' since 056. UNIQUE
--     (make_id, model_name) + NOT EXISTS guard make the model insert idempotent.
--   - cars store make/model as free TEXT (make_id is an optional FK, 002/003):
--     adding reference rows does NOT touch any existing car. No RLS change
--     (reference tables are public-read, service/curated writes only).
-- =============================================================================

-- 1) Allow the us_manual source tag on makes (mirrors 056 for models) ----------
alter table public.vehicle_makes drop constraint if exists vehicle_makes_source_check;
alter table public.vehicle_makes add constraint vehicle_makes_source_check
  check (source = any (array[
    'nhtsa',
    'carquery',
    'jdm_manual',
    'eu_manual',
    'us_manual',
    'user_added'
  ]));

-- 2) Insert the make (idempotent) ---------------------------------------------
insert into public.vehicle_makes (make_name, country, regions, source, is_active)
values ('INFINITI', 'JP', '{US}', 'us_manual', true)
on conflict (make_name) do nothing;

-- 3) Backfill the model lineup (idempotent: skip if the nameplate already exists)
--    make_id resolved by subquery so this is environment-portable (no hardcoded id).
insert into public.vehicle_models (make_id, model_name, year_start, year_end, source, is_jdm_only)
select m.id, v.model_name, v.year_start, v.year_end, 'us_manual', false
from public.vehicle_makes m
cross join (values
  -- Sedans / coupes
  ('M30',   1990, 1992),   -- F31 coupe/convertible
  ('Q45',   1990, 2006),   -- flagship sedan
  ('G20',   1991, 2002),
  ('J30',   1993, 1997),
  ('I30',   1996, 2001),
  ('I35',   2002, 2004),
  ('G35',   2003, 2007),   -- V35 (enthusiast: Skyline sibling)
  ('G37',   2008, 2013),   -- V36
  ('G25',   2011, 2012),
  ('Q40',   2014, 2015),   -- rebadged G37 sedan
  ('Q50',   2014, null),   -- sport sedan (still produced)
  ('Q60',   2014, null),   -- coupe (still produced)
  ('Q70',   2014, 2019),   -- successor to the M
  ('M35',   2006, 2010),
  ('M45',   2006, 2010),
  ('M37',   2011, 2013),
  ('M56',   2011, 2013),
  -- SUVs / crossovers
  ('QX4',   1997, 2003),
  ('FX35',  2003, 2012),
  ('FX37',  2013, 2013),
  ('FX45',  2003, 2008),
  ('FX50',  2009, 2013),
  ('EX35',  2008, 2012),
  ('EX37',  2013, 2013),
  ('QX56',  2004, 2013),
  ('QX50',  2014, null),   -- still produced
  ('QX55',  2022, null),
  ('QX60',  2013, null),
  ('QX70',  2014, 2017),   -- renamed FX
  ('QX80',  2011, null),   -- renamed QX56
  ('QX30',  2017, 2019)
) as v(model_name, year_start, year_end)
where m.make_name = 'INFINITI'
  and not exists (
    select 1 from public.vehicle_models x
    where x.make_id = m.id and x.model_name = v.model_name
  );
