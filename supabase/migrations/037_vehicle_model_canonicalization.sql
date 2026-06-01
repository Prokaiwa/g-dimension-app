-- =============================================================================
-- G-DIMENSION — Migration 037: vehicle model canonicalization
-- =============================================================================
-- Two related reference-data cleanups for the Add Car flow:
--
--   PART A — Collapse JDM nameplates stored split by generation / chassis code
--            ("Skyline R32", "Skyline R33", "Skyline R34") into ONE nameplate
--            model ("Skyline") with the generations moved down to the variant
--            layer that already exists (vehicle_variants — it already holds
--            "R32 GT-R", "R33 GT-R", etc.). The detailed trim variants are
--            re-parented onto the nameplate, and a plain generation variant
--            (just "R32") is added so the generation alone stays selectable.
--
--   PART B — Split Lexus nameplates the market sells as distinct sequential
--            generations (LS 400 / LS 430 / LS 460 / LS 500) out of the single
--            "LS" row into separate models.
--
-- SAFETY:
--   * Idempotent — safe to run more than once.
--   * Name-keyed, not id-keyed (live ids are unknown). A block that finds no
--     matching make/model simply no-ops and RAISEs a NOTICE so it is visible.
--   * FK-safe — vehicle_variants.model_id and cars.model_id are always
--     re-pointed BEFORE any vehicle_models row is deleted.
--   * Helpers are created in pg_temp (dropped automatically at session end).
--
-- HOW TO RUN: paste into the Supabase SQL Editor and execute. Read the NOTICE
--   output to confirm what changed. The editor runs this as one transaction —
--   if anything looks wrong, ROLLBACK before it commits.
--
-- AFTER CONFIRMING IT RAN: bump the watermark in supabase/hotfixes.sql and the
--   migration range / table in CLAUDE.md per the repo's "Live DB watermark rule".
-- =============================================================================


-- ── PART A helper: collapse split generations into one nameplate ─────────────
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
  v_gen_var    int;
  v_moved_cars int := 0;
  g            jsonb;
begin
  select id into v_make_id from public.vehicle_makes where make_name = p_make;
  if v_make_id is null then
    raise notice 'collapse_nameplate: make "%" not found — skipped', p_make;
    return;
  end if;

  -- Combined year range + a representative body style across the source rows.
  select min(year_start),
         max(year_end),
         bool_or(year_end is null),
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

  -- For each generation: add a plain chassis variant, re-parent its trim
  -- variants, re-point its cars, then drop the now-empty generation model.
  for g in select * from jsonb_array_elements(p_gens) loop
    select id into v_src_id from public.vehicle_models
     where make_id = v_make_id and model_name = (g->>'model');
    if v_src_id is null or v_src_id = v_target_id then
      continue;   -- already collapsed, or never existed
    end if;

    -- Plain generation variant (e.g. just "R32") so the generation is pickable.
    insert into public.vehicle_variants
      (model_id, variant_name, chassis_code, year_start, year_end, is_jdm_only, source)
    select v_target_id, g->>'code', g->>'code',
           m.year_start, m.year_end, true, 'jdm_manual'
      from public.vehicle_models m where m.id = v_src_id
    on conflict (model_id, variant_name) do nothing;

    select id into v_gen_var from public.vehicle_variants
     where model_id = v_target_id and variant_name = (g->>'code');

    -- Re-parent detailed trim variants (skip names already present on target).
    update public.vehicle_variants vv
       set model_id = v_target_id
     where vv.model_id = v_src_id
       and not exists (select 1 from public.vehicle_variants x
                        where x.model_id = v_target_id
                          and x.variant_name = vv.variant_name);
    delete from public.vehicle_variants where model_id = v_src_id;  -- drop collided dups

    -- Re-point cars: nameplate model, preserve generation as chassis_code, and
    -- attach the plain generation variant when the car had none.
    update public.cars
       set model_id     = v_target_id,
           variant_id   = coalesce(variant_id, v_gen_var),
           chassis_code = coalesce(chassis_code, g->>'code')
     where model_id = v_src_id;
    get diagnostics v_moved_cars = row_count;

    delete from public.vehicle_models where id = v_src_id;
    raise notice 'collapsed % "%" -> "%" (% cars re-pointed)',
      p_make, g->>'model', p_target, v_moved_cars;
  end loop;
end;
$$;


-- ── PART B helper: split one nameplate into sequential-era models ────────────
create or replace function pg_temp.split_nameplate(
  p_make    text,
  p_source  text,    -- existing single model, e.g. "LS"
  p_splits  jsonb,   -- [{"name":"LS 400","start":1989,"end":2000}, ...]
  p_default text     -- era to use when a car's year is null / out of range
) returns void language plpgsql as $$
declare
  v_make_id    int;
  v_source_id  int;
  v_body       text;
  v_jdm        boolean;
  v_split_id   int;
  v_default_id int;
  v_moved      int;
  s            jsonb;
begin
  select id into v_make_id from public.vehicle_makes where make_name = p_make;
  if v_make_id is null then
    raise notice 'split_nameplate: make "%" not found — skipped', p_make;
    return;
  end if;

  select id, body_style, is_jdm_only into v_source_id, v_body, v_jdm
    from public.vehicle_models where make_id = v_make_id and model_name = p_source;
  if v_source_id is null then
    raise notice 'split_nameplate: % model "%" not found — skipped '
                 '(tell me the actual model name in your data)', p_make, p_source;
    return;
  end if;

  -- Create each era model.
  for s in select * from jsonb_array_elements(p_splits) loop
    insert into public.vehicle_models
      (make_id, model_name, year_start, year_end, body_style, is_jdm_only, source)
    values
      (v_make_id, s->>'name', (s->>'start')::int,
       nullif(s->>'end','')::int, v_body, coalesce(v_jdm, false), 'user_added')
    on conflict (make_id, model_name) do nothing;
  end loop;

  select id into v_default_id from public.vehicle_models
   where make_id = v_make_id and model_name = p_default;

  -- Re-point cars to the era whose [start,end] contains cars.year.
  for s in select * from jsonb_array_elements(p_splits) loop
    select id into v_split_id from public.vehicle_models
     where make_id = v_make_id and model_name = (s->>'name');
    update public.cars c
       set model_id = v_split_id
     where c.model_id = v_source_id
       and c.year is not null
       and c.year >= (s->>'start')::int
       and (nullif(s->>'end','') is null or c.year <= (s->>'end')::int);
  end loop;

  -- Leftovers (null / out-of-range year) → default era.
  update public.cars set model_id = v_default_id where model_id = v_source_id;
  get diagnostics v_moved = row_count;

  -- Any variants that hung off the single model → default era.
  update public.vehicle_variants set model_id = v_default_id where model_id = v_source_id;

  delete from public.vehicle_models where id = v_source_id;
  raise notice 'split % "%" into % eras (% leftover cars -> "%")',
    p_make, p_source, jsonb_array_length(p_splits), v_moved, p_default;
end;
$$;


-- ── Execute ──────────────────────────────────────────────────────────────────
do $$
begin
  -- PART A — collapse generation-coded JDM nameplates into one model each.
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

  -- PART B — split Lexus LS into the sequential generations Lexus sold as
  --          distinct models. (Clean: the eras do not overlap.)
  perform pg_temp.split_nameplate('Lexus', 'LS',
    '[{"name":"LS 400","start":1989,"end":2000},
      {"name":"LS 430","start":2001,"end":2006},
      {"name":"LS 460","start":2007,"end":2017},
      {"name":"LS 500","start":2018,"end":null}]', 'LS 400');

  -- ── HELD FOR A DECISION — Lexus IS / GS / SC ───────────────────────────────
  -- Unlike LS, these engine-number suffixes are TRIMS sold side-by-side within
  -- the same era (IS 250 & IS 350 both 2006–2015; SC 300 & SC 400 both
  -- 1992–2000), so a year-based re-point of existing cars can't reliably tell
  -- them apart. They're left commented until we decide: split-as-models (with
  -- an arbitrary default for ambiguous existing cars) OR add them as variants.
  -- Enable only after confirming the trade-off.
  --
  -- perform pg_temp.split_nameplate('Lexus', 'SC',
  --   '[{"name":"SC 300","start":1992,"end":2000},
  --     {"name":"SC 400","start":1992,"end":2000},
  --     {"name":"SC 430","start":2001,"end":2010}]', 'SC 430');
  --
  -- perform pg_temp.split_nameplate('Lexus', 'GS',
  --   '[{"name":"GS 300","start":1993,"end":2011},
  --     {"name":"GS 350","start":2007,"end":2020},
  --     {"name":"GS 400","start":1998,"end":2000},
  --     {"name":"GS 430","start":2001,"end":2007},
  --     {"name":"GS F","start":2016,"end":2020}]', 'GS 350');
  --
  -- perform pg_temp.split_nameplate('Lexus', 'IS',
  --   '[{"name":"IS 300","start":2001,"end":2005},
  --     {"name":"IS 250","start":2006,"end":2015},
  --     {"name":"IS 350","start":2006,"end":2024},
  --     {"name":"IS 500","start":2022,"end":null}]', 'IS 250');
end $$;
