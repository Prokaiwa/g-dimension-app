-- =============================================================================
-- G-DIMENSION — Migration 037: collapse generation-split models to nameplates
-- =============================================================================
-- Some JDM nameplates were seeded split by generation / chassis code as
-- separate MODELS ("Skyline R32", "Skyline R33", "Skyline R34"). That makes the
-- model picker inconsistent with every other make — a 1999 and a 2008 Civic are
-- both just "Civic". This migration collapses those into ONE nameplate model
-- each ("Skyline"), matching how all other makes are stored.
--
-- The specific generation is NOT broken out into the model/variant picker. It
-- belongs ON THE CAR: cars.chassis_code (free text, e.g. "R32", "S14", "FD3S")
-- and cars.trim already exist for exactly this. So when a car is re-pointed
-- from a generation model to the nameplate, its chassis_code is back-filled
-- from the generation code if it was empty — no information is lost.
--
-- Detailed trim variants seeded in migration 017 (e.g. "R32 GT-R", "S14 Kouki")
-- are re-parented onto the nameplate model rather than deleted, so any car
-- linked via cars.variant_id keeps working and the reference data survives. The
-- model list itself just shows the single nameplate.
--
-- NOTE: Lexus LS / IS / GS are deliberately NOT touched. Their engine-number
-- suffixes (LS 430, IS 350) are recorded per-car in the Trim field, consistent
-- with the nameplate rule above.
--
-- SAFETY: idempotent, name-keyed (live ids unknown — a block that finds no
-- match no-ops with a NOTICE), and FK-safe (variants + cars are re-pointed
-- before any model is deleted). Helper lives in pg_temp. Runs as one
-- transaction in the SQL editor — review the NOTICE output, ROLLBACK if wrong.
--
-- AFTER CONFIRMING IT RAN: bump the watermark in supabase/hotfixes.sql and the
-- migration range / table in CLAUDE.md per the "Live DB watermark rule".
-- =============================================================================

create or replace function pg_temp.collapse_nameplate(
  p_make   text,
  p_target text,
  p_gens   jsonb   -- e.g. [{"model":"Skyline R32","code":"R32"}, ...]
) returns void language plpgsql as $$
declare
  v_make_id    int;
  v_target_id  int;
  v_src_id     int;
  v_min_start  int;
  v_max_end    int;
  v_open_end   boolean;
  v_body       text;
  v_moved_cars int := 0;
  g            jsonb;
begin
  select id into v_make_id from public.vehicle_makes where make_name = p_make;
  if v_make_id is null then
    raise notice 'collapse_nameplate: make "%" not found — skipped', p_make;
    return;
  end if;

  -- Combined year range + a representative body style across the source rows.
  select min(year_start), max(year_end), bool_or(year_end is null),
         (array_agg(body_style order by year_start))[1]
    into v_min_start, v_max_end, v_open_end, v_body
    from public.vehicle_models
   where make_id = v_make_id
     and model_name in (select x->>'model' from jsonb_array_elements(p_gens) x);

  if v_min_start is null then
    raise notice 'collapse_nameplate: no source models found for % %, skipped', p_make, p_target;
    return;
  end if;

  -- Ensure the single nameplate model exists / widen its year range.
  select id into v_target_id from public.vehicle_models
   where make_id = v_make_id and model_name = p_target;
  if v_target_id is null then
    insert into public.vehicle_models
      (make_id, model_name, year_start, year_end, body_style, is_jdm_only, source)
    values
      (v_make_id, p_target, v_min_start,
       case when v_open_end then null else v_max_end end, v_body, true, 'jdm_manual')
    returning id into v_target_id;
  else
    update public.vehicle_models
       set year_start = least(coalesce(year_start, v_min_start), v_min_start),
           year_end   = case when v_open_end or year_end is null
                             then null else greatest(year_end, v_max_end) end
     where id = v_target_id;
  end if;

  -- Per generation: re-parent its trim variants, re-point + back-fill its cars,
  -- then drop the now-empty generation model.
  for g in select * from jsonb_array_elements(p_gens) loop
    select id into v_src_id from public.vehicle_models
     where make_id = v_make_id and model_name = (g->>'model');
    if v_src_id is null or v_src_id = v_target_id then
      continue;   -- already collapsed, or never existed
    end if;

    -- Re-parent detailed trim variants (skip names already present on target).
    update public.vehicle_variants vv
       set model_id = v_target_id
     where vv.model_id = v_src_id
       and not exists (select 1 from public.vehicle_variants x
                        where x.model_id = v_target_id
                          and x.variant_name = vv.variant_name);
    delete from public.vehicle_variants where model_id = v_src_id;  -- drop collided dups

    -- Re-point cars to the nameplate; preserve the generation as chassis_code
    -- when the car does not already have one.
    update public.cars
       set model_id     = v_target_id,
           chassis_code = coalesce(nullif(trim(chassis_code), ''), g->>'code')
     where model_id = v_src_id;
    get diagnostics v_moved_cars = row_count;

    delete from public.vehicle_models where id = v_src_id;
    raise notice 'collapsed % "%" -> "%" (% cars re-pointed, chassis_code back-filled to %)',
      p_make, g->>'model', p_target, v_moved_cars, g->>'code';
  end loop;
end;
$$;


-- ── Execute ──────────────────────────────────────────────────────────────────
do $$
begin
  perform pg_temp.collapse_nameplate('Nissan', 'Skyline',
    '[{"model":"Skyline R32","code":"R32"},
      {"model":"Skyline R33","code":"R33"},
      {"model":"Skyline R34","code":"R34"}]');

  perform pg_temp.collapse_nameplate('Nissan', 'Silvia',
    '[{"model":"Silvia S13","code":"S13"},
      {"model":"Silvia S14","code":"S14"},
      {"model":"Silvia S15","code":"S15"}]');

  perform pg_temp.collapse_nameplate('Mazda', 'RX-7',
    '[{"model":"RX-7 FC3S","code":"FC3S"},
      {"model":"RX-7 FD3S","code":"FD3S"}]');

  perform pg_temp.collapse_nameplate('Toyota', 'Chaser',
    '[{"model":"Chaser JZX90","code":"JZX90"},
      {"model":"Chaser JZX100","code":"JZX100"}]');

  perform pg_temp.collapse_nameplate('Mitsubishi', 'Lancer Evolution',
    '[{"model":"Lancer Evolution IV","code":"Evo IV"},
      {"model":"Lancer Evolution V","code":"Evo V"},
      {"model":"Lancer Evolution VI","code":"Evo VI"}]');
end $$;
