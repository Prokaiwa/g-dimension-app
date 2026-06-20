-- =============================================================================
-- G-DIMENSION — Migration 057: more US muscle backfill (Plymouth / Buick / Olds)
-- =============================================================================
-- Follow-up to 056. Pontiac was already well covered (GTO, Firebird, LeMans,
-- Tempest, Catalina, Bonneville, Grand Prix), so the remaining gaps were Plymouth
-- (almost everything), plus a couple each on Buick and Oldsmobile.
-- Family-level only; trims ('Cuda, Superbird, GSX, Grand National, Hurst/Olds,
-- Trans Am) live on the car. Additive + idempotent. Safe to re-run.
-- =============================================================================

-- Drop commercial junk
delete from public.vehicle_models
where make_id = (select id from public.vehicle_makes where make_name = 'BUICK')
  and model_name = 'Incomplete';

-- Backfill (idempotent: skip if the nameplate already exists)
insert into public.vehicle_models (make_id, model_name, year_start, year_end, source, is_jdm_only)
select v.make_id, v.model_name, v.year_start, v.year_end, 'us_manual', false
from (values
  -- Plymouth (make_id 8176)
  (8176, 'Barracuda',   1964, 1974),
  (8176, 'Road Runner', 1968, 1980),
  (8176, 'GTX',         1967, 1971),
  (8176, 'Satellite',   1965, 1974),
  (8176, 'Belvedere',   1954, 1970),
  (8176, 'Duster',      1970, 1976),
  (8176, 'Valiant',     1960, 1976),
  (8176, 'Fury',        1956, 1978),
  -- Buick (make_id 1641)
  (1641, 'Gran Sport',  1965, 1975),
  (1641, 'Wildcat',     1963, 1970),
  -- Oldsmobile (make_id 7727)
  (7727, '442',         1964, 1991),
  (7727, 'F-85',        1961, 1972)
) as v(make_id, model_name, year_start, year_end)
where not exists (
  select 1 from public.vehicle_models m
  where m.make_id = v.make_id and m.model_name = v.model_name
);
