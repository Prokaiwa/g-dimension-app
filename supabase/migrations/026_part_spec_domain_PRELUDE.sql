-- =====================================================================
-- Migration 026: Part Spec System Domain Pass
-- =====================================================================
-- Purpose: Complete rebuild of the spec_templates seed for all 168
--          modification part_types. This migration replaces the partial
--          (and silently failed) seed from migration 024.
--
-- Sections:
--   1. Schema additions (new columns)
--   2. Part type adjustments (renames, new part_types, deletes)
--   3. Wipe existing spec_templates
--   4. Seed spec_templates by category (17 categories, fail-loud)
--   5. Verification (raises if counts don't match expected)
--
-- Safety: Wrapped in BEGIN/COMMIT. No exception handlers — every error
--         must surface. Fails atomically.
-- =====================================================================

begin;

-- =====================================================================
-- SECTION 1: Schema additions
-- =====================================================================

-- 1A. Placeholder text on spec_templates (Decision 019)
alter table public.spec_templates
  add column if not exists placeholder text;

comment on column public.spec_templates.placeholder is
  'Example value shown ghosted inside empty input. Different from help_text.';

alter table public.part_types
  add column if not exists notes_placeholder text;

comment on column public.part_types.notes_placeholder is
  'Per-part_type placeholder text for the parent job notes field.';

-- 1B. Cost separation on jobs (Decision 018)
alter table public.jobs
  add column if not exists parts_cost numeric(10,2),
  add column if not exists labor_cost numeric(10,2),
  add column if not exists installed_by text;

alter table public.jobs drop constraint if exists jobs_installed_by_check;
alter table public.jobs drop constraint if exists jobs_parts_cost_check;
alter table public.jobs drop constraint if exists jobs_labor_cost_check;

alter table public.jobs
  add constraint jobs_installed_by_check
    check (installed_by is null or installed_by in ('self', 'shop'));

alter table public.jobs
  add constraint jobs_parts_cost_check
    check (parts_cost is null or parts_cost >= 0);

alter table public.jobs
  add constraint jobs_labor_cost_check
    check (labor_cost is null or labor_cost >= 0);

comment on column public.jobs.parts_cost is
  'Cost of parts only (excludes labor). Price aggregator queries this column.';

comment on column public.jobs.labor_cost is
  'Cost of shop labor for install. NULL when DIY.';

comment on column public.jobs.installed_by is
  '''self'' (DIY) or ''shop'' (paid install). NULL when unknown.';

-- =====================================================================
-- SECTION 2: Part type adjustments
-- =====================================================================
-- Goal: bring total to 168 part_types from current 105.
-- Net change: +63 (+64 added across 13 categories, -1 deleted from Paint & Wrap)
-- =====================================================================

-- 2A. Renames
update public.part_types
  set name = 'Tires — Performance / Street'
  where category = 'Wheels & Tires' and name = 'Tires — Metric';

update public.part_types
  set name = 'Tires — Truck / Off-Road'
  where category = 'Wheels & Tires' and name = 'Tires — Truck/Standard';

-- 2B. Delete (Ceramic Coating moves to maintenance per Decision 023)
delete from public.part_types
  where category = 'Paint & Wrap' and name = 'Ceramic Coating';

-- 2C. Additions

-- ENGINE: +9 (current 13 → 22). Note: target was 20 but with the
--   Spark Plugs / Ignition Coils additions and keeping Engine Rebuild
--   plus Oil Catch Can plus Nitrous, we land at 22. Re-confirming with
--   final verification count.
insert into public.part_types (category, name, display_order) values
  ('Engine', 'Spark Plugs',                14),
  ('Engine', 'Ignition Coils',             15),
  ('Engine', 'Crankshaft',                 16),
  ('Engine', 'Engine Block Reinforcement', 17),
  ('Engine', 'Head Gasket / Head Studs',   18),
  ('Engine', 'Oil Pan',                    19),
  ('Engine', 'Engine Mounts',              20),
  ('Engine', 'Timing Belt / Chain',        21),
  ('Engine', 'Nitrous Oxide System',       22)
on conflict do nothing;

-- DRIVETRAIN: +5 (8 → 13)
insert into public.part_types (category, name, display_order) values
  ('Drivetrain', 'Limited Slip Differential (LSD)',           9),
  ('Drivetrain', 'Final Drive / Ring & Pinion',              10),
  ('Drivetrain', 'Transmission Mount',                       11),
  ('Drivetrain', 'Carrier Bearing / Driveshaft Center Support', 12),
  ('Drivetrain', 'Differential / Subframe Bushings',         13)
on conflict do nothing;

-- SUSPENSION: +11 (8 → 19)
insert into public.part_types (category, name, display_order) values
  ('Suspension', 'Air-over-Coilover / Hybrid',         9),
  ('Suspension', 'Camber / Caster Kit',                10),
  ('Suspension', 'Endlinks',                           11),
  ('Suspension', 'Tie Rods',                           12),
  ('Suspension', 'Trailing Arms / Toe Arms',           13),
  ('Suspension', 'Subframe',                           14),
  ('Suspension', 'Steering Rack',                      15),
  ('Suspension', 'Pillow Ball / Strut Top Mounts',     16),
  ('Suspension', 'Roll Center Correction Kit',         17),
  ('Suspension', 'Bump Steer Kit',                     18),
  ('Suspension', 'Angle Kit (Steering Angle)',         19)
on conflict do nothing;

-- BRAKES: +4 (7 → 11)
insert into public.part_types (category, name, display_order) values
  ('Brakes', 'Brake Booster',                          8),
  ('Brakes', 'Proportioning Valve / Bias Controller',  9),
  ('Brakes', 'Hydraulic E-Brake',                     10),
  ('Brakes', 'Brake Cooling Ducts',                   11)
on conflict do nothing;

-- WHEELS & TIRES: +3 (4 → 7)
insert into public.part_types (category, name, display_order) values
  ('Wheels & Tires', 'Lug Nuts / Wheel Studs',         5),
  ('Wheels & Tires', 'Hub-Centric Rings',              6),
  ('Wheels & Tires', 'Wheel Bearings / Hub Assembly',  7)
on conflict do nothing;

-- FORCED INDUCTION: +3 (7 → 10) — Boost Controller / Charge Piping already exist
insert into public.part_types (category, name, display_order) values
  ('Forced Induction', 'Boost Solenoid',                    8),
  ('Forced Induction', 'Air-to-Water Setup',                9),
  ('Forced Induction', 'Turbo Exhaust Manifold (Hot Side)', 10)
on conflict do nothing;

-- EXHAUST: +3 (6 → 9) — Mid-pipe already exists
insert into public.part_types (category, name, display_order) values
  ('Exhaust', 'Muffler',              7),
  ('Exhaust', 'Exhaust Cutout',       8),
  ('Exhaust', 'Heat Wrap / Coating',  9)
on conflict do nothing;

-- COOLING: +6 (7 → 13)
insert into public.part_types (category, name, display_order) values
  ('Cooling', 'Differential Cooler',               8),
  ('Cooling', 'Power Steering Cooler',             9),
  ('Cooling', 'Coolant Hoses / Silicone Hose Kit', 10),
  ('Cooling', 'Coolant / Antifreeze',              11),
  ('Cooling', 'Heat Exchanger',                    12),
  ('Cooling', 'Bumper Cooling Mods',               13)
on conflict do nothing;

-- FUEL SYSTEM: +3 (5 → 8)
insert into public.part_types (category, name, display_order) values
  ('Fuel System', 'Fuel Rail',              6),
  ('Fuel System', 'Fuel Filter',            7),
  ('Fuel System', 'Fuel Cell / Race Tank',  8)
on conflict do nothing;

-- ELECTRICAL: +4 (4 → 8)
insert into public.part_types (category, name, display_order) values
  ('Electrical', 'Grounding Kit',                   5),
  ('Electrical', 'Voltage Stabilizer',              6),
  ('Electrical', 'Capacitor / Power Cap',           7),
  ('Electrical', 'Kill Switch / Battery Disconnect', 8)
on conflict do nothing;

-- AUDIO: +1 (4 → 5). Sound Deadening stays in Interior.
insert into public.part_types (category, name, display_order) values
  ('Audio', 'DSP / Signal Processor',  5)
on conflict do nothing;

-- LIGHTING: +2 (5 → 7)
insert into public.part_types (category, name, display_order) values
  ('Lighting', 'Light Bar / Aux Lights',          6),
  ('Lighting', 'Side Markers / Bumper Lights',    7)
on conflict do nothing;

-- SAFETY: +3 (5 → 8)
insert into public.part_types (category, name, display_order) values
  ('Safety', 'HANS / Head & Neck Restraint',  6),
  ('Safety', 'Race Suit / Driver Apparel',    7),
  ('Safety', 'Camera / Data Logger',          8)
on conflict do nothing;

-- EXTERIOR: +3 (7 → 10)
insert into public.part_types (category, name, display_order) values
  ('Exterior', 'Splitter / Aero Underbody',  8),
  ('Exterior', 'Canards / Dive Planes',      9),
  ('Exterior', 'Hood Vents (Functional)',    10)
on conflict do nothing;

-- INTERIOR: +4 (8 → 12)
insert into public.part_types (category, name, display_order) values
  ('Interior', 'Pedals',          9),
  ('Interior', 'Floor Mats',      10),
  ('Interior', 'Headliner',       11),
  ('Interior', 'Comfort Delete',  12)
on conflict do nothing;

-- =====================================================================
-- SECTION 3: Wipe existing spec_templates
-- =====================================================================
-- Pre-launch there is no user data, so this is safe.
-- =====================================================================

delete from public.spec_templates;

do $$
declare
  remaining integer;
begin
  select count(*) into remaining from public.spec_templates;
  if remaining > 0 then
    raise exception 'Section 3: spec_templates wipe incomplete, % rows remain', remaining;
  end if;
  raise notice 'Section 3: spec_templates wiped clean (0 rows)';
end $$;

-- =====================================================================
-- SECTION 4: Seed spec_templates (17 categories follow in next file)
-- =====================================================================

-- [Category seeds inserted in 02_engine.sql, 03_drivetrain.sql, etc.]

-- =====================================================================
-- SECTION 5: Verification
-- =====================================================================

do $$
declare
  expected_part_types integer := 168;
  actual_part_types integer;
  empty_part_types integer;
  bad_options integer;
  bad_unit_preference integer;
begin
  select count(*) into actual_part_types from public.part_types;
  if actual_part_types != expected_part_types then
    raise exception 'Section 5.1: expected % part_types, found %',
      expected_part_types, actual_part_types;
  end if;

  select count(*) into empty_part_types
  from public.part_types pt
  left join public.spec_templates st on st.part_type_id = pt.id
  where st.id is null
    and pt.category != 'Other';

  if empty_part_types > 0 then
    raise exception 'Section 5.2: % part_types (excl. Other) have no spec_templates', empty_part_types;
  end if;

  select count(*) into bad_options
  from public.spec_templates
  where input_type in ('select', 'multiselect')
    and (options is null or jsonb_array_length(options) = 0);

  if bad_options > 0 then
    raise exception 'Section 5.3: % select/multiselect templates missing valid options', bad_options;
  end if;

  select count(*) into bad_unit_preference
  from public.spec_templates
  where unit_preference is not null
    and unit_preference not in ('spring_rate', 'pressure', 'temp');

  if bad_unit_preference > 0 then
    raise exception 'Section 5.4: % spec_templates have non-canonical unit_preference', bad_unit_preference;
  end if;

  raise notice 'Section 5: all verification checks passed (part_types=%)', actual_part_types;
end $$;

commit;
