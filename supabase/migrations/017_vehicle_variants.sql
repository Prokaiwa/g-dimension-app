-- =============================================================================
-- G-DIMENSION — Migration 017: vehicle_variants
-- =============================================================================
-- Sub-model / chassis code layer beneath vehicle_models.
-- Allows users to specify not just "Nissan Silvia" but "Nissan Silvia S14 Kouki"
-- or "Honda Civic EK9 Type R".
--
-- WHY THIS EXISTS:
--   In enthusiast culture, the chassis code IS the car. An S13 and an S14 are
--   completely different vehicles that happen to share the "Silvia" nameplate.
--   An EK9 is not just a Civic — it's a specific generation with a specific
--   engine (B16B) that defines the car's entire identity.
--   Autotrader and CarGurus collapse all of these into "make/model/year" and
--   lose enormous specificity. G-Dimension preserves it.
--
-- DATA SOURCE:
--   Seeded from CarQuery API (trim/variant fields) and manual JDM curation.
--   CarQuery provides trim names — we parse chassis codes from them.
--   Manual curation is required for accuracy on JDM variants.
--
-- HOW IT CONNECTS TO cars TABLE:
--   cars.model_id → vehicle_models.id (e.g. "Silvia")
--   cars.variant_id → vehicle_variants.id (e.g. "S14 Kouki")  ← new FK added to cars
--   cars.make and cars.model remain free-text for display.
--   cars.chassis_code is populated from vehicle_variants.chassis_code if selected.
--
-- NOTE: cars table needs variant_id column added (see bottom of this file).
-- =============================================================================

create table if not exists public.vehicle_variants (
  id            serial primary key,
  model_id      integer not null references public.vehicle_models(id) on delete cascade,

  -- Identity
  variant_name  text not null,         -- "S14 Kouki", "Type R", "Spec-R", "GT-R V-Spec II"
  chassis_code  text,                  -- "S14", "EK9", "BNR34", "JZX100"
  trim_level    text,                  -- "Spec-R", "Spec-S", "Type R", "GT-R", "Base"

  -- Production window (more specific than model year range)
  year_start    integer,
  year_end      integer,

  -- Powertrain (from CarQuery or manual)
  engine_code   text,                  -- "SR20DET", "B16B", "RB26DETT", "2JZ-GTE"
  engine_cc     integer,               -- Displacement in cc
  power_hp      integer,               -- Factory power in hp (stored in hp per base unit rule)
  torque_lbft   integer,               -- Factory torque in lb-ft (stored in lb-ft per base unit rule)
  drive         text check (drive in ('rwd','fwd','awd','4wd')),
  transmission  text,                  -- "Manual 6-speed", "Automatic 4-speed"

  -- Market context
  is_jdm_only   boolean not null default false,
  source        text not null
                  check (source in ('carquery','nhtsa','jdm_manual','eu_manual','user_added'))
                  default 'jdm_manual',

  created_at    timestamptz not null default now(),

  constraint vehicle_variants_unique unique (model_id, variant_name)
);

comment on table  public.vehicle_variants is 'Sub-model/chassis layer. EK9, S14, BNR34, JZX100 — the level of specificity enthusiasts actually care about.';
comment on column public.vehicle_variants.chassis_code is 'The chassis code enthusiasts use. S14, EK9, BNR34, FD3S, etc.';
comment on column public.vehicle_variants.engine_code is 'Engine family code. SR20DET, B16B, RB26DETT, 2JZ-GTE, etc.';
comment on column public.vehicle_variants.power_hp is 'Factory horsepower in hp (base unit — convert at display per users.power_unit).';
comment on column public.vehicle_variants.torque_lbft is 'Factory torque in lb-ft (base unit — convert at display per users.torque_unit).';

-- Indexes for autocomplete and lookup
create index if not exists vehicle_variants_model_id
  on public.vehicle_variants (model_id);

create index if not exists vehicle_variants_chassis_code
  on public.vehicle_variants (chassis_code)
  where chassis_code is not null;

-- Trigram for fuzzy variant search ("Kouki", "EK9", "GT-R V-Spec")
create index if not exists vehicle_variants_name_trgm
  on public.vehicle_variants using gin (variant_name gin_trgm_ops);

-- Trigram for chassis code search
create index if not exists vehicle_variants_chassis_trgm
  on public.vehicle_variants using gin (chassis_code gin_trgm_ops)
  where chassis_code is not null;

-- =============================================================================
-- ADD variant_id to cars table (connects a car to a specific chassis variant)
-- =============================================================================

alter table public.cars
  add column if not exists variant_id integer references public.vehicle_variants(id) on delete set null;

alter table public.cars
  add column if not exists chassis_code text;
  -- Free text fallback if variant isn't in the database
  -- Auto-populated from vehicle_variants.chassis_code when variant_id is set

comment on column public.cars.variant_id is 'Links to vehicle_variants for chassis-level specificity (S14, EK9, BNR34, etc).';
comment on column public.cars.chassis_code is 'Free-text chassis code. Set from variant_id or entered manually for rare cars.';

-- =============================================================================
-- SEED DATA: Most popular JDM variants
-- This is not exhaustive — it covers the core enthusiast vehicles.
-- Expand via CarQuery API import script or community contribution.
-- =============================================================================

-- Note: This seed runs after vehicle_makes and vehicle_models are populated.
-- model_id values are looked up by name — adjust if your make/model names differ.

-- Wrapped in a DO block so it's safe to run even if some models don't exist yet
do $$
declare
  v_make_id integer;
  v_model_id integer;
begin

  -- ===== NISSAN =====
  select id into v_make_id from public.vehicle_makes where make_name = 'Nissan';
  if v_make_id is not null then

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Silvia S13';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'S13 Q''s', 'PS13', 'Q''s', 1988, 1993, 'CA18DET', 1809, 168, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S13 K''s', 'S13', 'K''s', 1988, 1993, 'SR20DET', 1998, 202, 'rwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Silvia S14';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'S14 Zenki Q''s', 'S14', 'Q''s', 1993, 1996, 'SR20DE', 1998, 147, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S14 Zenki K''s', 'S14', 'K''s', 1993, 1996, 'SR20DET', 1998, 220, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S14 Kouki Q''s', 'S14', 'Q''s Kouki', 1996, 1998, 'SR20DE', 1998, 147, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S14 Kouki K''s', 'S14', 'K''s Kouki', 1996, 1998, 'SR20DET', 1998, 220, 'rwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Silvia S15';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'S15 Spec-S',   'S15', 'Spec-S',   1999, 2002, 'SR20DE',  1998, 165, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S15 Spec-R',   'S15', 'Spec-R',   1999, 2002, 'SR20DET', 1998, 247, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'S15 Autech',   'S15', 'Autech',   1999, 2002, 'SR20DE',  1998, 165, 'rwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Skyline R32';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'R32 GTS-t',      'HCR32', 'GTS-t',        1989, 1994, 'RB20DET',  1998, 212, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'R32 GT-R',       'BNR32', 'GT-R',         1989, 1994, 'RB26DETT', 2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R32 GT-R V-Spec','BNR32', 'GT-R V-Spec',  1992, 1994, 'RB26DETT', 2568, 276, 'awd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Skyline R33';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'R33 GTS25t',      'ECRS33', 'GTS25t',         1993, 1998, 'RB25DET',  2498, 247, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'R33 GT-R',        'BCNR33', 'GT-R',           1995, 1998, 'RB26DETT', 2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R33 GT-R V-Spec', 'BCNR33', 'GT-R V-Spec',    1995, 1998, 'RB26DETT', 2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R33 GT-R LM Limited', 'BCNR33', 'GT-R LM', 1996, 1996, 'RB26DETT', 2568, 276, 'awd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Skyline R34';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'R34 25GT-t',          'ER34',  '25GT-t',             1998, 2002, 'RB25DET',   2498, 276, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'R34 GT-R',            'BNR34', 'GT-R',               1999, 2002, 'RB26DETT',  2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R34 GT-R V-Spec',     'BNR34', 'GT-R V-Spec',        1999, 2002, 'RB26DETT',  2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R34 GT-R V-Spec II',  'BNR34', 'GT-R V-Spec II',     2000, 2002, 'RB26DETT',  2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R34 GT-R M-Spec',     'BNR34', 'GT-R M-Spec',        2001, 2002, 'RB26DETT',  2568, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'R34 GT-R Nur',        'BNR34', 'GT-R Nür',           2002, 2002, 'RB26DETT',  2568, 276, 'awd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

  end if;

  -- ===== TOYOTA =====
  select id into v_make_id from public.vehicle_makes where make_name = 'Toyota';
  if v_make_id is not null then

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Chaser JZX100';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'JZX100 Tourer V', 'JZX100', 'Tourer V', 1996, 2001, '1JZ-GTE', 2492, 276, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'JZX100 Tourer S', 'JZX100', 'Tourer S', 1996, 2001, '1JZ-GE',  2492, 168, 'rwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Aristo JZS161';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'JZS161 V300',        'JZS161', 'V300',          1997, 2004, '2JZ-GTE', 2998, 276, 'rwd', true, 'jdm_manual'),
        (v_model_id, 'JZS161 V300 Vertex', 'JZS161', 'V300 Vertex',   1997, 2004, '2JZ-GTE', 2998, 276, 'rwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

  end if;

  -- ===== HONDA =====
  select id into v_make_id from public.vehicle_makes where make_name = 'Honda';
  if v_make_id is not null then

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Civic Type R EK9';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'EK9 Type R', 'EK9', 'Type R', 1997, 2000, 'B16B', 1595, 182, 'fwd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Integra Type R DC2';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'DC2 JDM Type R', 'DC2', 'Type R (JDM)', 1995, 2001, 'B18C', 1797, 197, 'fwd', true,  'jdm_manual'),
        (v_model_id, 'DC2 USDM Type R','DC2', 'Type R (USDM)',1997, 2001, 'B18C', 1797, 195, 'fwd', false, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

  end if;

  -- ===== MAZDA =====
  select id into v_make_id from public.vehicle_makes where make_name = 'Mazda';
  if v_make_id is not null then

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'RX-7 FD3S';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'FD3S Type R',           'FD3S', 'Type R',           1991, 1995, '13B-REW', 1308, 255, 'rwd', true,  'jdm_manual'),
        (v_model_id, 'FD3S Touring X',        'FD3S', 'Touring X',        1995, 2002, '13B-REW', 1308, 255, 'rwd', true,  'jdm_manual'),
        (v_model_id, 'FD3S Spirit R Type A',  'FD3S', 'Spirit R Type A',  2002, 2002, '13B-REW', 1308, 276, 'rwd', true,  'jdm_manual'),
        (v_model_id, 'FD USDM R1',            'FD3S', 'R1',               1993, 1995, '13B-REW', 1308, 255, 'rwd', false, 'jdm_manual'),
        (v_model_id, 'FD USDM R2',            'FD3S', 'R2',               1993, 1995, '13B-REW', 1308, 255, 'rwd', false, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

  end if;

  -- ===== MITSUBISHI =====
  select id into v_make_id from public.vehicle_makes where make_name = 'Mitsubishi';
  if v_make_id is not null then

    select id into v_model_id from public.vehicle_models where make_id = v_make_id and model_name = 'Lancer Evolution VI';
    if v_model_id is not null then
      insert into public.vehicle_variants (model_id, variant_name, chassis_code, trim_level, year_start, year_end, engine_code, engine_cc, power_hp, drive, is_jdm_only, source)
      values
        (v_model_id, 'Evo VI GSR',         'CP9A', 'GSR',          1999, 2001, '4G63T', 1997, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'Evo VI RS',          'CP9A', 'RS',           1999, 2001, '4G63T', 1997, 276, 'awd', true, 'jdm_manual'),
        (v_model_id, 'Evo VI Tommi Makinen','CP9A', 'Tommi Makinen',1999, 2000, '4G63T', 1997, 276, 'awd', true, 'jdm_manual')
      on conflict (model_id, variant_name) do nothing;
    end if;

  end if;

  raise notice 'vehicle_variants seed complete.';

exception
  when others then
    raise notice 'vehicle_variants seed encountered an error: %. Continuing.', sqlerrm;
end;
$$;

-- No RLS on reference tables (public read, service role writes)
grant select on public.vehicle_variants to anon, authenticated;
