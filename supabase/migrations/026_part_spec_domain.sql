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



-- =====================================================================
-- 026 Section 4.1: ENGINE (22 part_types)
-- =====================================================================
-- Plain English: Spec templates for every Engine part_type. These are
-- the form fields that show when a user logs an Engine modification.
-- Every field follows Decision 021: only required if it's a true
-- discriminator that controls form structure. Everything else optional.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Cold Air Intake / Short Ram
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Cold Air Intake / Short Ram';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'intake_type', 'Intake Type', 'select', null,
    '["Cold Air Intake","Short Ram","Velocity Stack","OEM Replacement"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'filter_type', 'Filter Type', 'select', null,
    '["Dry","Oiled (K&N style)","Foam","OEM Paper"]'::jsonb,
    null, false, false, 2, 'Filter', null, null),
  (pt_id, 'heat_shield', 'Heat Shield', 'boolean', null, null,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'pipe_diameter_mm', 'Pipe Diameter', 'number', 'mm', null,
    null, false, false, 4, 'Details', null, '76'),
  (pt_id, 'pipe_material', 'Pipe Material', 'select', null,
    '["Aluminum","Stainless Steel","Carbon Fiber","Silicone","Plastic"]'::jsonb,
    null, false, false, 5, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'AEM, K&N, Injen'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Intake Manifold
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Intake Manifold';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'manifold_style', 'Manifold Style', 'select', null,
    '["OEM","Ported OEM","Aftermarket Cast","Aftermarket Sheet Metal","Tubular"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'manifold_material', 'Material', 'select', null,
    '["Aluminum","Plastic","Magnesium","Composite"]'::jsonb,
    null, false, false, 2, 'Details', null, null),
  (pt_id, 'runner_length_mm', 'Runner Length', 'number', 'mm', null,
    null, false, true, 3, 'Details', null, null),
  (pt_id, 'plenum_volume_l', 'Plenum Volume', 'number', 'L', null,
    null, false, true, 4, 'Details', null, null),
  (pt_id, 'has_velocity_stacks', 'Velocity Stacks', 'boolean', null, null,
    null, false, false, 5, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Skunk2, Edelbrock, Plazmaman'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Throttle Body
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Throttle Body';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bore_diameter_mm', 'Bore Diameter', 'number', 'mm', null,
    null, false, false, 1, 'Sizing', null, '70'),
  (pt_id, 'tb_count', 'Number of Throttle Bodies', 'number', null, null,
    null, false, false, 2, 'Sizing', '1 = single, 4+ = ITB setup', '1'),
  (pt_id, 'actuation', 'Actuation', 'select', null,
    '["Cable","Drive-by-Wire (DBW)"]'::jsonb,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'is_itb', 'Individual Throttle Bodies (ITB)', 'boolean', null, null,
    null, false, false, 4, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Camshafts
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Camshafts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cam_position', 'Position', 'select', null,
    '["Intake","Exhaust","Both","Single Cam"]'::jsonb,
    null, true, false, 1, 'Configuration', null, null),
  (pt_id, 'cam_grade', 'Cam Grade / Stage', 'text', null, null,
    null, false, false, 2, 'Configuration', null, 'Tomei Type B, BC Stage 2'),
  (pt_id, 'duration_intake_deg', 'Intake Duration', 'number', 'deg', null,
    null, false, true, 3, 'Specs', null, '264'),
  (pt_id, 'duration_exhaust_deg', 'Exhaust Duration', 'number', 'deg', null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'lift_intake_mm', 'Intake Lift', 'number', 'mm', null,
    null, false, true, 5, 'Specs', null, null),
  (pt_id, 'lift_exhaust_mm', 'Exhaust Lift', 'number', 'mm', null,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'lobe_separation_deg', 'Lobe Separation Angle', 'number', 'deg', null,
    null, false, true, 7, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'Tomei, BC, Kelford'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Valves / Valve Springs
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Valves / Valve Springs';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'component', 'Component', 'select', null,
    '["Valves","Valve Springs","Valve Spring Retainers","Full Valvetrain Kit"]'::jsonb,
    null, true, false, 1, 'Component', null, null),
  (pt_id, 'valve_material', 'Valve Material', 'select', null,
    '["Stainless Steel","Inconel","Titanium"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'spring_pressure_lbs', 'Seat Pressure', 'number', 'lbs', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'oversized', 'Oversized Valves', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Supertech, Ferrea, BC'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Pistons
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Pistons';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'piston_construction', 'Construction', 'select', null,
    '["Cast","Hypereutectic","Forged"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'compression_ratio', 'Compression Ratio', 'number', ':1', null,
    null, false, false, 2, 'Specs', null, '9.5'),
  (pt_id, 'bore_size_mm', 'Bore Size', 'number', 'mm', null,
    null, false, false, 3, 'Specs', null, '86'),
  (pt_id, 'piston_coating', 'Skirt Coating', 'select', null,
    '["None","Moly","Teflon","Ceramic"]'::jsonb,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'ring_pack', 'Ring Pack', 'text', null, null,
    null, false, true, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'CP-Carrillo, JE, Wiseco, Mahle'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Connecting Rods
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Connecting Rods';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'rod_construction', 'Construction', 'select', null,
    '["OEM","Forged H-Beam","Forged I-Beam","Billet"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'rod_material', 'Material', 'select', null,
    '["4340 Steel","300M Steel","Aluminum","Titanium"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'rod_length_mm', 'Rod Length', 'number', 'mm', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'rod_bolt_type', 'Rod Bolt Type', 'select', null,
    '["OEM","ARP 2000","ARP 625+","Custom"]'::jsonb,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Manley, Eagle, Carrillo, K1'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Engine Management / ECU
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Engine Management / ECU';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'ecu_type', 'ECU Type', 'select', null,
    '["Reflashed Stock","Piggyback","Standalone"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'tuning_software', 'Tuning Software', 'text', null, null,
    null, false, false, 2, 'Tuning', null, 'HP Tuners, Cobb, Hondata, EcuTek'),
  (pt_id, 'supports_flex_fuel', 'Flex Fuel Supported', 'boolean', null, null,
    null, false, false, 3, 'Capabilities', null, null),
  (pt_id, 'has_datalogging', 'Datalogging Supported', 'boolean', null, null,
    null, false, false, 4, 'Capabilities', null, null),
  (pt_id, 'has_custom_tune', 'Custom Tune', 'boolean', null, null,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Cobb, Hondata, AEM, Haltech, MoTeC'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Head Work / Porting
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Head Work / Porting';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'porting_level', 'Porting Level', 'select', null,
    '["Mild Port & Polish","Stage 1","Stage 2","Full Race Port"]'::jsonb,
    null, false, false, 1, 'Scope', null, null),
  (pt_id, 'valve_job', 'Valve Job', 'select', null,
    '["Stock","3-Angle","5-Angle","Race Cut"]'::jsonb,
    null, false, false, 2, 'Scope', null, null),
  (pt_id, 'cc_volume', 'Combustion Chamber CC', 'number', 'cc', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'is_decked', 'Deck Surface Machined', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'shop_name', 'Machine Shop', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Engine Rebuild
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Engine Rebuild';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'rebuild_scope', 'Rebuild Scope', 'select', null,
    '["Refresh (rings/bearings)","Short Block","Long Block","Full Build"]'::jsonb,
    null, true, false, 1, 'Scope', null, null),
  (pt_id, 'overbore', 'Overbore', 'select', null,
    '["Standard","+0.5mm","+1.0mm","Custom"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'rotating_assembly', 'Rotating Assembly', 'select', null,
    '["OEM","Stroker","Built"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'target_horsepower', 'Target Horsepower', 'number', 'hp', null,
    null, false, false, 4, 'Goals', null, '500'),
  (pt_id, 'is_balanced', 'Balanced & Blueprinted', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'shop_name', 'Builder / Shop', 'text', null, null,
    null, false, false, 6, 'Source', null, 'DIY, or shop name');

-- ---------------------------------------------------------------------
-- 11. Oil Catch Can
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Oil Catch Can';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'can_type', 'Type', 'select', null,
    '["Single","Dual","Air-Oil Separator (AOS)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'capacity_oz', 'Capacity', 'number', 'oz', null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_drain', 'Has Drain', 'boolean', null, null,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'is_baffled', 'Baffled', 'boolean', null, null,
    null, false, false, 4, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Mishimoto, Radium, JLT'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 12. Fuel Injectors (lives in Engine in 024 — kept for backward compat)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Fuel Injectors';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'flow_rate_cc', 'Flow Rate', 'number', 'cc/min', null,
    null, false, false, 1, 'Sizing',
    'cc/min flow rate. e.g. 1000cc ≈ 95 lb/hr', '1000'),
  (pt_id, 'injector_type', 'Injector Type', 'select', null,
    '["Top-Feed","Side-Feed","Direct Injection"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'impedance', 'Impedance', 'select', null,
    '["High-Z (Saturated)","Low-Z (Peak & Hold)"]'::jsonb,
    null, false, true, 3, 'Type', null, null),
  (pt_id, 'connector_type', 'Connector Type', 'text', null, null,
    null, false, true, 4, 'Type', null, 'EV1, EV6, USCAR'),
  (pt_id, 'fuel_compatibility', 'Fuel Compatibility', 'multiselect', null,
    '["Gasoline","E85","Methanol","Race Fuel"]'::jsonb,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Injector Dynamics, FIC, DeatschWerks, Bosch'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 13. Fuel Pump (lives in Engine in 024 — kept for backward compat)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Fuel Pump';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pump_location', 'Pump Location', 'select', null,
    '["In-Tank","External / Inline","Surge Tank Feed"]'::jsonb,
    null, true, false, 1, 'Location', null, null),
  (pt_id, 'flow_rate_lph', 'Flow Rate', 'number', 'L/hr', null,
    null, false, false, 2, 'Sizing', null, '450'),
  (pt_id, 'pressure_rating_psi', 'Pressure Rating', 'number', 'psi', null,
    'pressure', false, true, 3, 'Sizing', null, null),
  (pt_id, 'is_brushless', 'Brushless', 'boolean', null, null,
    null, false, false, 4, 'Type', null, null),
  (pt_id, 'fuel_compatibility', 'Fuel Compatibility', 'multiselect', null,
    '["Gasoline","E85","Methanol","Race Fuel"]'::jsonb,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Walbro, AEM, DeatschWerks, Radium'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 14. Spark Plugs (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Spark Plugs';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'heat_range', 'Heat Range', 'text', null, null,
    null, false, false, 1, 'Specs', 'Manufacturer heat range code', '7, 8, BKR7E-11'),
  (pt_id, 'gap_mm', 'Gap', 'number', 'mm', null,
    null, false, false, 2, 'Specs', null, '0.8'),
  (pt_id, 'electrode_material', 'Electrode Material', 'select', null,
    '["Copper","Platinum","Iridium","Ruthenium","Racing"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'plug_count', 'Number of Plugs', 'number', null, null,
    null, false, false, 4, 'Specs', null, '4'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'NGK, Denso, Brisk, Champion'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 15. Ignition Coils (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Ignition Coils';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'coil_type', 'Type', 'select', null,
    '["OEM Replacement","COP Conversion","High-Performance Aftermarket","Smart Coil"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'coil_count', 'Number of Coils', 'number', null, null,
    null, false, false, 2, 'Specs', null, '4'),
  (pt_id, 'requires_harness', 'Requires Harness Adapter', 'boolean', null, null,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Okada Plasma Direct, MSD, Denso, Audi R8'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 16. Crankshaft (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Crankshaft';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'crank_construction', 'Construction', 'select', null,
    '["OEM Cast","OEM Forged","Aftermarket Forged","Billet"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'crank_material', 'Material', 'select', null,
    '["4340 Steel","4340 EN30B","Billet Steel"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'stroke_mm', 'Stroke', 'number', 'mm', null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'is_stroker', 'Stroker', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'is_balanced', 'Balanced', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'is_counterweighted', 'Counterweighted', 'boolean', null, null,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'BC, Eagle, Manley, K1'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 17. Engine Block Reinforcement (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Engine Block Reinforcement';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'reinforcement_type', 'Reinforcement Type', 'multiselect', null,
    '["Main Studs","Main Cap Upgrade","Girdle","Block Fill (Half)","Block Fill (Full)","Cylinder Sleeves","Closed Deck Conversion"]'::jsonb,
    null, true, false, 1, 'Scope', null, null),
  (pt_id, 'main_stud_brand', 'Main Stud Brand', 'text', null, null,
    null, false, false, 2, 'Components', null, 'ARP 2000, ARP 625+'),
  (pt_id, 'sleeve_brand', 'Sleeve Brand', 'text', null, null,
    null, false, false, 3, 'Components', null, 'Darton MID'),
  (pt_id, 'girdle_brand', 'Girdle Brand', 'text', null, null,
    null, false, false, 4, 'Components', null, 'Cosworth, BC'),
  (pt_id, 'block_fill_height_pct', 'Block Fill Height', 'number', '%', null,
    null, false, true, 5, 'Specs', '50% for half-fill, 100% for full', '50');

-- ---------------------------------------------------------------------
-- 18. Head Gasket / Head Studs (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Head Gasket / Head Studs';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'component', 'Component', 'select', null,
    '["Head Gasket Only","Head Studs Only","Both"]'::jsonb,
    null, true, false, 1, 'Component', null, null),
  (pt_id, 'gasket_type', 'Gasket Type', 'select', null,
    '["OEM","Multi-Layer Steel (MLS)","Copper","Cometic","Other"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'gasket_thickness_mm', 'Gasket Thickness', 'number', 'mm', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'bore_size_mm', 'Bore Size', 'number', 'mm', null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'stud_brand', 'Stud Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'ARP 2000, ARP L19');

-- ---------------------------------------------------------------------
-- 19. Oil Pan (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Oil Pan';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pan_type', 'Pan Type', 'select', null,
    '["OEM","Aftermarket Steel","Aluminum","Track / Race","Dry Sump Conversion"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'has_baffle', 'Has Baffle', 'boolean', null, null,
    null, false, false, 2, 'Details', null, null),
  (pt_id, 'has_windage_tray', 'Has Windage Tray', 'boolean', null, null,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'capacity_qt', 'Capacity', 'number', 'qt', null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'has_magnet_drain', 'Magnetic Drain Plug', 'boolean', null, null,
    null, false, false, 5, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Moroso, Canton, Tomei'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 20. Engine Mounts (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Engine Mounts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mount_material', 'Material', 'select', null,
    '["OEM Rubber","Polyurethane","Solid (Aluminum/Steel)","Hybrid"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'durometer', 'Durometer', 'number', null, null,
    null, false, true, 2, 'Specs', 'Hardness rating, e.g. 70A, 80A', '75'),
  (pt_id, 'positions_replaced', 'Positions Replaced', 'multiselect', null,
    '["Front Driver","Front Passenger","Rear/Trans","All"]'::jsonb,
    null, false, false, 3, 'Scope', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Innovative Mounts, Hasport, Whiteline'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 21. Timing Belt / Chain (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Timing Belt / Chain';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'timing_type', 'Type', 'select', null,
    '["Belt","Chain","Belt-in-Oil"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'kit_components', 'Kit Components', 'multiselect', null,
    '["Belt/Chain Only","Tensioner","Idler Pulleys","Water Pump","Full Kit"]'::jsonb,
    null, false, false, 2, 'Scope', null, null),
  (pt_id, 'is_kevlar', 'Kevlar Belt', 'boolean', null, null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'has_billet_tensioner', 'Billet Tensioner', 'boolean', null, null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Gates, Cloyes, HKS, OEM'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 22. Nitrous Oxide System (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Engine' and name = 'Nitrous Oxide System';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'system_type', 'System Type', 'select', null,
    '["Wet Shot (Direct Port)","Wet Shot (Single Nozzle)","Dry Shot","Plate System","Progressive Controller System"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'shot_size_hp', 'Shot Size', 'number', 'hp', null,
    null, false, false, 2, 'Specs', null, '100'),
  (pt_id, 'bottle_capacity_lbs', 'Bottle Capacity', 'number', 'lbs', null,
    null, false, false, 3, 'Specs', null, '10'),
  (pt_id, 'has_bottle_heater', 'Bottle Heater', 'boolean', null, null,
    null, false, false, 4, 'Details', null, null),
  (pt_id, 'has_purge_valve', 'Purge Valve', 'boolean', null, null,
    null, false, false, 5, 'Details', null, null),
  (pt_id, 'has_progressive_controller', 'Progressive Controller', 'boolean', null, null,
    null, false, true, 6, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'NOS, Nitrous Express, ZEX'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

raise notice 'Engine seed complete: 22 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.2: DRIVETRAIN (13 part_types)
-- =====================================================================
-- Plain English: Spec templates for everything power-transfer related.
-- Clutch, flywheel, transmission, differential, axles, mounts, bushings.
-- Includes donor swap support via the existing jobs.is_donor_part flag
-- (the spec form adapts when donor is true — Decision 009).
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Clutch
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Clutch';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'clutch_stage', 'Stage / Level', 'select', null,
    '["OEM Replacement","Stage 1","Stage 2","Stage 3","Stage 4","Stage 5","Twin/Triple Disc"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'disc_count', 'Disc Count', 'number', null, null,
    null, false, false, 2, 'Specs', '1 = single, 2 = twin, 3 = triple', '1'),
  (pt_id, 'disc_material', 'Disc Material', 'select', null,
    '["Organic","Kevlar","Cerametallic","Sintered Iron","Carbon"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'pressure_plate_lbs', 'Pressure Plate Force', 'number', 'lbs', null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'has_sprung_hub', 'Sprung Hub', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'torque_capacity_lbft', 'Torque Capacity', 'number', 'lb-ft', null,
    null, false, false, 6, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'ACT, Exedy, Competition Clutch, OS Giken'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Flywheel
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Flywheel';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'flywheel_material', 'Material', 'select', null,
    '["OEM Cast Iron","Steel","Billet Steel","Aluminum","Chromoly"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'weight_lbs', 'Weight', 'number', 'lbs', null,
    null, false, false, 2, 'Specs', null, '12'),
  (pt_id, 'is_lightweight', 'Lightweight', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_replaceable_ring_gear', 'Replaceable Ring Gear', 'boolean', null, null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Fidanza, Exedy, ACT, Competition Clutch'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Differential (full diff carrier; LSD is a separate part_type below)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Differential';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'diff_position', 'Position', 'select', null,
    '["Front","Rear","Center","Transfer Case"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'diff_type', 'Differential Type', 'select', null,
    '["Open","Welded","Locker (Mechanical)","Locker (Electronic)","Spool"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'housing_material', 'Housing Material', 'select', null,
    '["OEM Cast","Aluminum","Billet"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_finned_cover', 'Finned Cooling Cover', 'boolean', null, null,
    null, false, false, 4, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Driveshaft
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Driveshaft';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'driveshaft_material', 'Material', 'select', null,
    '["OEM Steel","Aluminum","Steel (Aftermarket)","Carbon Fiber","Chromoly"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'pieces', 'Pieces', 'select', null,
    '["One-Piece","Two-Piece","Three-Piece"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'u_joints', 'U-Joint Type', 'select', null,
    '["OEM","Greaseable Aftermarket","Heavy-Duty","CV-Joint Conversion"]'::jsonb,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'length_mm', 'Length', 'number', 'mm', null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'The Driveshaft Shop, Driveshaft Brothers, OEM'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Axles / Half-shafts
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Axles / Half-shafts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'axle_position', 'Position', 'select', null,
    '["Front Driver","Front Passenger","Rear Driver","Rear Passenger","All"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'axle_construction', 'Construction', 'select', null,
    '["OEM","Reinforced","Chromoly","300M","Billet"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'spline_count', 'Spline Count', 'number', null, null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'cv_joint_type', 'CV Joint Type', 'select', null,
    '["OEM","Heavy-Duty","Race"]'::jsonb,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'The Driveshaft Shop, GKN, Wavetrac'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Transmission
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Transmission';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'transmission_type', 'Transmission Type', 'select', null,
    '["OEM","OEM Rebuild","Aftermarket Synchro","Dog Box","Sequential","Dual-Clutch (DCT)","Auto-to-Manual Swap","Manual-to-Auto Swap"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'gear_count', 'Number of Gears', 'number', null, null,
    null, true, false, 2, 'Specs', null, '6'),
  (pt_id, 'gear_pattern', 'Shift Pattern', 'select', null,
    '["H-Pattern","Sequential","Paddle Shift"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'gear_cut', 'Gear Cut', 'select', null,
    '["Helical (OEM)","Straight-Cut (Spur)","Mixed"]'::jsonb,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'has_close_ratio', 'Close-Ratio Gearset', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'has_quickshift', 'Quick Shift Conversion', 'boolean', null, null,
    null, false, false, 6, 'Specs', null, null),
  (pt_id, 'swap_reason', 'Swap Reason', 'multiselect', null,
    '["Stronger / More Torque","More Gears","Better Ratios","Sequential Conversion","Original Failed","AWD Conversion","Other"]'::jsonb,
    null, false, false, 7, 'Swap Context',
    'Optional. Helps build community swap fitment data.', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'Quaife, Holinger, GearMotive, Albins'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, 'QKE7J, MFT, ZF Sequential');

-- ---------------------------------------------------------------------
-- 7. Short Shifter
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Short Shifter';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'shifter_type', 'Type', 'select', null,
    '["Short-Throw Adapter","Full Replacement Shifter","Quick-Shift Plate"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'throw_reduction_pct', 'Throw Reduction', 'number', '%', null,
    null, false, false, 2, 'Specs', null, '30'),
  (pt_id, 'shifter_height', 'Shifter Height', 'select', null,
    '["OEM","Lower","Higher","Adjustable"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'B&M, Cobb, Kartboy, Cusco'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Shifter Bushings
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Shifter Bushings';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bushing_material', 'Material', 'select', null,
    '["OEM Rubber","Polyurethane","Delrin","Solid Aluminum","Brass"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'location', 'Location', 'multiselect', null,
    '["Shifter Base","Shift Linkage","Cable Bushings","Trans Selector"]'::jsonb,
    null, false, false, 2, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Whiteline, Energy Suspension, SuperPro'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Limited Slip Differential (LSD) — NEW
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Limited Slip Differential (LSD)';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'lsd_type', 'LSD Type', 'select', null,
    '["Clutch-Type 1-Way","Clutch-Type 1.5-Way","Clutch-Type 2-Way","Helical / Torsen","Viscous","Electronic","Welded (DIY locker)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'lsd_position', 'Position', 'select', null,
    '["Front","Rear","Center"]'::jsonb,
    null, true, false, 2, 'Position', null, null),
  (pt_id, 'preload_kgm', 'Preload', 'number', 'kg-m', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'requires_break_in', 'Requires Break-In', 'boolean', null, null,
    null, false, false, 4, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Cusco, OS Giken, Wavetrac, Tomei, Quaife'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'RS, Super Lock, Type-RS');

-- ---------------------------------------------------------------------
-- 10. Final Drive / Ring & Pinion — NEW
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Final Drive / Ring & Pinion';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'final_drive_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'ratio_text', 'Final Drive Ratio', 'text', null, null,
    null, false, false, 2, 'Specs', null, '4.10, 4.30, 3.73'),
  (pt_id, 'ratio_direction', 'Ratio Direction', 'select', null,
    '["Numerically Higher (Shorter, more accel)","Numerically Lower (Taller, more top-end)"]'::jsonb,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Yukon, Motive Gear, OS Giken'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 11. Transmission Mount — NEW
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Transmission Mount';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mount_material', 'Material', 'select', null,
    '["OEM Rubber","Polyurethane","Solid (Aluminum/Steel)","Hybrid"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'durometer', 'Durometer', 'number', null, null,
    null, false, true, 2, 'Specs', 'Hardness rating, e.g. 70A, 80A', '75'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Innovative Mounts, Hasport, Whiteline'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 12. Carrier Bearing / Driveshaft Center Support — NEW
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Carrier Bearing / Driveshaft Center Support';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bearing_type', 'Bearing Type', 'select', null,
    '["OEM","Heavy-Duty Aftermarket","Solid (Eliminator)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'housing_material', 'Housing', 'select', null,
    '["OEM Rubber","Polyurethane","Solid Aluminum"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 13. Differential / Subframe Bushings — NEW
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Drivetrain' and name = 'Differential / Subframe Bushings';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bushing_material', 'Material', 'select', null,
    '["OEM Rubber","Polyurethane","Delrin","Solid Aluminum","Spherical Bearing"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'location', 'Location', 'multiselect', null,
    '["Diff Carrier","Subframe (Front)","Subframe (Rear)","Differential Mount","Trailing Arm"]'::jsonb,
    null, true, false, 2, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Whiteline, Energy Suspension, SuperPro, Powerflex'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Drivetrain seed complete: 13 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.3: SUSPENSION (19 part_types)
-- =====================================================================
-- Plain English: Spec templates for everything between the chassis and
-- the wheels. Coilovers, springs, sway bars, control arms, bushings,
-- alignment, plus drift-specific (angle kit) and stance-specific
-- (air-over-coilover hybrid) categories.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Coilovers
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Coilovers';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'coilover_type', 'Coilover Type', 'select', null,
    '["Full Coilover","Threaded Sleeve / Slip-On","Drag-Specific","Hydraulic"]'::jsonb,
    null, false, false, 1, 'Type',
    'Full = purpose-built strut + spring. Sleeve = adapter over OEM strut.', null),
  (pt_id, 'damping_type', 'Damping Adjustment', 'select', null,
    '["Non-Adjustable","1-Way","2-Way","3-Way","4-Way"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'spring_rate_f', 'Front Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 3, 'Springs', null, '8'),
  (pt_id, 'spring_rate_r', 'Rear Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 4, 'Springs', null, '6'),
  (pt_id, 'ride_height_drop_mm', 'Ride Height Drop', 'number', 'mm', null,
    null, false, false, 5, 'Height', null, '40'),
  (pt_id, 'is_inverted', 'Inverted Strut', 'boolean', null, null,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'has_pillow_ball_mounts', 'Pillow Ball Mounts', 'boolean', null, null,
    null, false, false, 7, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'BC Racing, KW, Ohlins, HKS, Tein, Stance'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, 'BR, Variant 3, DFV');

-- ---------------------------------------------------------------------
-- 2. Air Suspension / Bags
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Air Suspension / Bags';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'management_system', 'Management', 'select', null,
    '["Manual Paddle","Air Lift 3P","Air Lift 3H","Accuair Endo","Accuair E-Level","AirREX","Other Digital"]'::jsonb,
    null, true, false, 1, 'Management', null, null),
  (pt_id, 'strut_type', 'Strut Type', 'select', null,
    '["Bag-Over-Shock","Strut Replacement","Universal Bags"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'tank_size_gal', 'Tank Size', 'number', 'gal', null,
    null, false, false, 3, 'Air System', null, '5'),
  (pt_id, 'compressor_count', 'Number of Compressors', 'number', null, null,
    null, false, false, 4, 'Air System', null, '1'),
  (pt_id, 'max_pressure_psi', 'Max Pressure', 'number', 'psi', null,
    'pressure', false, true, 5, 'Air System', null, '200'),
  (pt_id, 'drop_aired_mm', 'Drop (Aired Out)', 'number', 'mm', null,
    null, false, false, 6, 'Height', null, null),
  (pt_id, 'ride_height_pressure_psi', 'Ride Pressure', 'number', 'psi', null,
    'pressure', false, true, 7, 'Height', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'Air Lift Performance, AirREX, Universal Air'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Lowering Springs
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Lowering Springs';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'drop_front_mm', 'Front Drop', 'number', 'mm', null,
    null, false, false, 1, 'Drop', null, '30'),
  (pt_id, 'drop_rear_mm', 'Rear Drop', 'number', 'mm', null,
    null, false, false, 2, 'Drop', null, '30'),
  (pt_id, 'spring_rate_f', 'Front Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 3, 'Specs', null, null),
  (pt_id, 'spring_rate_r', 'Rear Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 4, 'Specs', null, null),
  (pt_id, 'is_progressive', 'Progressive Rate', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Eibach, H&R, Tein, RS-R'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Pro-Kit, Sport');

-- ---------------------------------------------------------------------
-- 4. Sway Bars
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Sway Bars';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'sway_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'diameter_front_mm', 'Front Diameter', 'number', 'mm', null,
    null, false, false, 2, 'Specs', null, '24'),
  (pt_id, 'diameter_rear_mm', 'Rear Diameter', 'number', 'mm', null,
    null, false, false, 3, 'Specs', null, '22'),
  (pt_id, 'is_adjustable', 'Adjustable', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'adjustment_holes', 'Adjustment Holes', 'number', null, null,
    null, false, true, 5, 'Specs', null, '3'),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Solid","Hollow / Tubular"]'::jsonb,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Whiteline, Cusco, Eibach, Hotchkis'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Control Arms
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Control Arms';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'arm_position', 'Arm Position', 'multiselect', null,
    '["Front Upper","Front Lower","Rear Upper","Rear Lower"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'arm_construction', 'Construction', 'select', null,
    '["OEM Steel","Aftermarket Steel","Aluminum","Chromoly","Tubular"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'pivot_type', 'Pivot Type', 'select', null,
    '["Rubber Bushing","Polyurethane","Pillow Ball","Spherical Bearing"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'is_adjustable', 'Adjustable', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'adjusts', 'Adjusts', 'multiselect', null,
    '["Camber","Caster","Toe","Roll Center"]'::jsonb,
    null, false, true, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'SPL, Megan, Cusco, Hardrace'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Bushings
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Bushings';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bushing_material', 'Material', 'select', null,
    '["OEM Rubber","Polyurethane","Delrin","Solid Aluminum","Spherical Bearing"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'location', 'Location', 'multiselect', null,
    '["Front Subframe","Rear Subframe","Differential","Trailing Arm","Steering Rack","Sway Bar Endlinks","Sway Bar Mounts","Engine","Transmission"]'::jsonb,
    null, true, false, 2, 'Coverage', null, null),
  (pt_id, 'durometer', 'Durometer', 'number', null, null,
    null, false, true, 3, 'Specs', 'Hardness rating, e.g. 70A, 80A, 95A', '80'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Whiteline, Energy Suspension, SuperPro, Powerflex'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Strut Tower Brace
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Strut Tower Brace';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'brace_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'brace_material', 'Material', 'select', null,
    '["Steel","Aluminum","Carbon Fiber","Titanium"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_brake_master_clearance', 'Brake Master Cylinder Clearance', 'boolean', null, null,
    null, false, true, 3, 'Fitment', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Cusco, Tanabe, Beatrush, Ultra Racing'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Alignment
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Alignment';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'alignment_type', 'Alignment Type', 'select', null,
    '["Street","Sport / Performance","Track / Race","Drag","Drift","Stance / Show","Custom"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'camber_front_deg', 'Front Camber', 'number', 'deg', null,
    null, false, false, 2, 'Camber', null, '-2.5'),
  (pt_id, 'camber_rear_deg', 'Rear Camber', 'number', 'deg', null,
    null, false, false, 3, 'Camber', null, '-2.0'),
  (pt_id, 'toe_front_deg', 'Front Toe', 'number', 'deg', null,
    null, false, true, 4, 'Toe', null, null),
  (pt_id, 'toe_rear_deg', 'Rear Toe', 'number', 'deg', null,
    null, false, true, 5, 'Toe', null, null),
  (pt_id, 'caster_front_deg', 'Front Caster', 'number', 'deg', null,
    null, false, true, 6, 'Caster', null, null),
  (pt_id, 'ride_height_front_mm', 'Front Ride Height', 'number', 'mm', null,
    null, false, true, 7, 'Height', null, null),
  (pt_id, 'ride_height_rear_mm', 'Rear Ride Height', 'number', 'mm', null,
    null, false, true, 8, 'Height', null, null);

-- ---------------------------------------------------------------------
-- 9. Air-over-Coilover / Hybrid (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Air-over-Coilover / Hybrid';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'management_system', 'Management', 'select', null,
    '["Air Lift 3P","Air Lift 3H","Accuair","AirREX","Other"]'::jsonb,
    null, true, false, 1, 'Management', null, null),
  (pt_id, 'damping_type', 'Damping Adjustment', 'select', null,
    '["Non-Adjustable","1-Way","2-Way","3-Way","4-Way"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'spring_rate_f', 'Front Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 3, 'Springs', null, null),
  (pt_id, 'spring_rate_r', 'Rear Spring Rate', 'number', 'kg/mm', null,
    'spring_rate', false, false, 4, 'Springs', null, null),
  (pt_id, 'tank_size_gal', 'Tank Size', 'number', 'gal', null,
    null, false, false, 5, 'Air System', null, null),
  (pt_id, 'drop_aired_mm', 'Drop (Aired Out)', 'number', 'mm', null,
    null, false, false, 6, 'Height', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Air Lift Performance Series, AirREX, BC Racing'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Camber / Caster Kit (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Camber / Caster Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'kit_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'adjusts', 'Adjusts', 'multiselect', null,
    '["Camber","Caster","Toe"]'::jsonb,
    null, true, false, 2, 'Adjustments', null, null),
  (pt_id, 'adjustment_method', 'Adjustment Method', 'select', null,
    '["Eccentric Bolts","Replacement Arms","Slotted Mounts","Adjustable Top Mounts"]'::jsonb,
    null, false, false, 3, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'SPC, Whiteline, Eibach, SPL'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 11. Endlinks (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Endlinks';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'endlink_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'is_adjustable', 'Adjustable Length', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["OEM Replacement","Heavy-Duty","Heim Joint","Spherical"]'::jsonb,
    null, false, false, 3, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Whiteline, Cusco, SPL, Hotchkis'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 12. Tie Rods (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Tie Rods';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'tie_rod_type', 'Type', 'select', null,
    '["Inner Only","Outer Only","Inner + Outer","Adjustable / Bump Steer"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["OEM","Heavy-Duty","Heim/Rod-End"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'SPL, Megan, Hardrace, GKTECH'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 13. Trailing Arms / Toe Arms (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Trailing Arms / Toe Arms';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'arm_type', 'Arm Type', 'multiselect', null,
    '["Trailing Arm","Toe Arm","Traction Arm","Camber Arm"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'arm_construction', 'Construction', 'select', null,
    '["OEM Steel","Aluminum","Chromoly","Tubular"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'pivot_type', 'Pivot Type', 'select', null,
    '["Rubber Bushing","Polyurethane","Pillow Ball","Spherical Bearing"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'is_adjustable', 'Adjustable', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'SPL, Megan, GKTECH, Cusco'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 14. Subframe (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Subframe';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'subframe_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'modification_type', 'Modification', 'select', null,
    '["Reinforced (Welded)","Replacement (OEM)","Aftermarket Performance","Custom Tubular"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'has_collars', 'Subframe Collars Installed', 'boolean', null, null,
    null, false, false, 3, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Cusco, GKTECH, SPL'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 15. Steering Rack (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Steering Rack';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'rack_type', 'Rack Type', 'select', null,
    '["OEM Replacement","Quicker Ratio (Aftermarket)","Quicker Ratio (Donor Swap)","Hydraulic-to-Electric Conversion","Manual Conversion"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'ratio_text', 'Steering Ratio', 'text', null, null,
    null, false, true, 2, 'Specs', null, '13:1, 2.5 turns lock-to-lock'),
  (pt_id, 'has_rack_spacers', 'Rack Spacers Installed', 'boolean', null, null,
    null, false, true, 3, 'Details', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 16. Pillow Ball / Strut Top Mounts (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Pillow Ball / Strut Top Mounts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mount_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'is_camber_adjustable', 'Adjustable Camber', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'is_caster_adjustable', 'Caster Adjustable', 'boolean', null, null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Spherical Bearing","Pillow Ball","Polyurethane"]'::jsonb,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'SPL, Cusco, Vorshlag, Whiteline'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 17. Roll Center Correction Kit (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Roll Center Correction Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'correction_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'correction_method', 'Correction Method', 'select', null,
    '["Extended Ball Joint","Drop Knuckle","Adjustable Lower Mount","Custom Fabricated"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Buddy Club, Whiteline, SPL Parts'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 18. Bump Steer Kit (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Bump Steer Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'correction_position', 'Position', 'select', null,
    '["Front","Rear"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'correction_method', 'Correction Method', 'select', null,
    '["Tie Rod Spacers","Adjustable Tie Rod Ends","Steering Rack Shims","Drop Knuckle"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'SPL, Whiteline, Hardrace'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 19. Angle Kit (Steering Angle) (NEW — drift-specific)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Suspension' and name = 'Angle Kit (Steering Angle)';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'max_angle_deg', 'Max Steering Angle', 'number', 'deg', null,
    null, false, false, 1, 'Specs', null, '65'),
  (pt_id, 'kit_components', 'Kit Components', 'multiselect', null,
    '["Knuckles","Lower Control Arms","Tie Rods","Tension Rods","Subframe Spacers","Anti-Ackerman Geometry"]'::jsonb,
    null, true, false, 2, 'Components', null, null),
  (pt_id, 'modifies_ackerman', 'Anti-Ackerman Geometry', 'boolean', null, null,
    null, false, false, 3, 'Geometry', null, null),
  (pt_id, 'roll_center_corrected', 'Roll Center Corrected', 'boolean', null, null,
    null, false, true, 4, 'Geometry', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Wisefab, GKTECH, Powerhouse Racing, Parts Shop Max'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'V2, V3');

raise notice 'Suspension seed complete: 19 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.4: BRAKES (11 part_types)
-- =====================================================================
-- Plain English: Spec templates for brake system. Pads, rotors, calipers,
-- big brake kits, fluid, lines, master cylinder, plus track-specific
-- (cooling ducts, bias controller) and drift-specific (hydraulic e-brake).
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Brake Pads
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Pads';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pad_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'compound', 'Compound', 'select', null,
    '["OEM Replacement","Street Performance","Street/Track Hybrid","Track-Only","Race","Drag","Drift Specialty"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'friction_rating', 'Friction Rating', 'text', null, null,
    null, false, true, 3, 'Specs', 'SAE friction code', 'GG, FF, HH'),
  (pt_id, 'operating_temp_range', 'Operating Temp Range', 'text', null, null,
    null, false, true, 4, 'Specs', null, '0-650°C'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Hawk, PFC, Endless, Carbotech, EBC'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'HP+, 08, MX72');

-- ---------------------------------------------------------------------
-- 2. Rotors
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Rotors';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'rotor_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'rotor_diameter_mm', 'Diameter', 'number', 'mm', null,
    null, false, false, 2, 'Sizing', null, '330'),
  (pt_id, 'rotor_thickness_mm', 'Thickness', 'number', 'mm', null,
    null, false, true, 3, 'Sizing', null, null),
  (pt_id, 'rotor_construction', 'Construction', 'select', null,
    '["OEM Cast Iron","One-Piece (Aftermarket)","Two-Piece Floating","Carbon Ceramic"]'::jsonb,
    null, false, false, 4, 'Type', null, null),
  (pt_id, 'rotor_finish', 'Surface Finish', 'select', null,
    '["Blank","Slotted","Drilled","Slotted & Drilled","Dimpled"]'::jsonb,
    null, false, false, 5, 'Finish', null, null),
  (pt_id, 'rotor_vane_count', 'Vane Count', 'number', null, null,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Brembo, Stoptech, DBA, Girodisc'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Brake Calipers
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Calipers';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'caliper_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'caliper_construction', 'Construction', 'select', null,
    '["OEM Single-Piston Floating","OEM Multi-Piston Fixed","Aftermarket Forged","Aftermarket Billet","Donor Swap"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'piston_count', 'Piston Count', 'number', null, null,
    null, false, false, 3, 'Specs', null, '4'),
  (pt_id, 'pad_size', 'Pad Size', 'text', null, null,
    null, false, true, 4, 'Specs', null, 'Brembo F40, AP CP9540'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Brembo, Stoptech, AP Racing, Wilwood'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'GT, ST60, CP9540');

-- ---------------------------------------------------------------------
-- 4. Big Brake Kit
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Big Brake Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'kit_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'kit_components', 'Kit Includes', 'multiselect', null,
    '["Calipers","Rotors","Pads","Brake Lines","Mounting Brackets","Hubs"]'::jsonb,
    null, true, false, 2, 'Components', null, null),
  (pt_id, 'rotor_diameter_mm', 'Rotor Diameter', 'number', 'mm', null,
    null, false, false, 3, 'Sizing', null, '380'),
  (pt_id, 'piston_count', 'Piston Count', 'number', null, null,
    null, false, false, 4, 'Specs', null, '6'),
  (pt_id, 'min_wheel_size_in', 'Minimum Wheel Size', 'number', 'in', null,
    null, false, true, 5, 'Fitment', null, '18'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Brembo GT-R, AP Racing, Stoptech, Wilwood'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, 'GT-R, CP9540');

-- ---------------------------------------------------------------------
-- 5. Brake Fluid
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Fluid';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fluid_type', 'Fluid Type', 'select', null,
    '["DOT 3","DOT 4","DOT 5 (Silicone)","DOT 5.1","Racing (Non-DOT)"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'dry_boiling_point_c', 'Dry Boiling Point', 'number', '°C', null,
    'temp', false, true, 2, 'Specs', null, '300'),
  (pt_id, 'wet_boiling_point_c', 'Wet Boiling Point', 'number', '°C', null,
    'temp', false, true, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Motul, Castrol, ATE, Endless'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, 'RBF 660, SRF, Type 200');

-- ---------------------------------------------------------------------
-- 6. Brake Lines
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Lines';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'line_position', 'Position', 'select', null,
    '["Front","Rear","Both","Full System"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'line_construction', 'Construction', 'select', null,
    '["OEM Rubber","Stainless Steel Braided","PTFE-Lined","Kevlar Reinforced"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'has_dot_certification', 'DOT Certified', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Goodridge, Stoptech, HEL, Earl''s'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Master Cylinder
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Master Cylinder';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bore_size_mm', 'Bore Size', 'number', 'mm', null,
    null, false, false, 1, 'Sizing', null, '25.4'),
  (pt_id, 'mc_type', 'Master Cylinder Type', 'select', null,
    '["OEM Replacement","Larger Bore Upgrade","Smaller Bore (Track)","Tilton Pedal Box","Donor Swap"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Tilton, Wilwood, OEM'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Brake Booster (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Booster';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'booster_type', 'Type', 'select', null,
    '["OEM Replacement","Larger Booster","Manual Conversion (Booster Delete)","Hydroboost","Electric Booster"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Proportioning Valve / Bias Controller (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Proportioning Valve / Bias Controller';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'valve_type', 'Type', 'select', null,
    '["Adjustable Proportioning Valve (Cabin Mounted)","Adjustable Proportioning Valve (Inline)","Bias Bar (Pedal Box)","Electronic Bias Controller"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, 'Wilwood, Tilton, AP Racing'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Hydraulic E-Brake (NEW — drift-specific)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Hydraulic E-Brake';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'ebrake_type', 'Type', 'select', null,
    '["Vertical (Pull-Up)","Horizontal","Twin Caliper Conversion"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_locking_mechanism', 'Locking Mechanism', 'boolean', null, null,
    null, false, false, 2, 'Details', null, null),
  (pt_id, 'caliper_setup', 'Caliper Setup', 'select', null,
    '["OEM Caliper","Dedicated Drift Caliper","Twin Caliper (Performance + E-Brake)"]'::jsonb,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'GKTECH, Wilwood, AST, AutoPower'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 11. Brake Cooling Ducts (NEW — track-specific)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Brakes' and name = 'Brake Cooling Ducts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'duct_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'duct_source', 'Air Source', 'select', null,
    '["Front Bumper Inlet","Brake Backing Plate","Hood / Wheel Well","Custom"]'::jsonb,
    null, true, false, 2, 'Routing', null, null),
  (pt_id, 'duct_size_mm', 'Duct Diameter', 'number', 'mm', null,
    null, false, true, 3, 'Specs', null, '76'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

raise notice 'Brakes seed complete: 11 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.5: WHEELS & TIRES (7 part_types)
-- =====================================================================
-- Plain English: Spec templates for wheels, tires, and related fitment
-- hardware. Uses the fitment_setup discriminator pattern (Decision 015)
-- so users log ONE wheel/tire job per setup with optional rear-specific
-- values when staggered.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Wheels
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Wheels';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fitment_setup', 'Fitment Setup', 'select', null,
    '["Square (same all 4)","Width-Staggered (same diameter, different width F/R)","Diameter-Staggered (different diameter F/R)","Fully Staggered (different diameter and width F/R)","Offset-Staggered (same size, different offset F/R)"]'::jsonb,
    null, true, false, 1, 'Setup',
    'Square = all four wheels identical. Staggered = front and rear differ.', null),
  (pt_id, 'diameter_in', 'Diameter', 'number', 'in', null,
    null, false, false, 2, 'Front (or All)', null, '18'),
  (pt_id, 'width_in', 'Width', 'number', 'in', null,
    null, false, false, 3, 'Front (or All)', null, '9.5'),
  (pt_id, 'offset_mm', 'Offset', 'number', 'mm', null,
    null, false, false, 4, 'Front (or All)', null, '+25'),
  (pt_id, 'diameter_rear_in', 'Rear Diameter', 'number', 'in', null,
    null, false, false, 5, 'Rear (if staggered)',
    'Only fill in if diameter differs front to rear', null),
  (pt_id, 'width_rear_in', 'Rear Width', 'number', 'in', null,
    null, false, false, 6, 'Rear (if staggered)',
    'Only fill in if width differs front to rear', '10.5'),
  (pt_id, 'offset_rear_mm', 'Rear Offset', 'number', 'mm', null,
    null, false, false, 7, 'Rear (if staggered)',
    'Only fill in if offset differs front to rear', '+15'),
  (pt_id, 'bolt_pattern', 'Bolt Pattern', 'text', null, null,
    null, false, false, 8, 'Fitment', null, '5x114.3'),
  (pt_id, 'hub_bore_mm', 'Hub Bore', 'number', 'mm', null,
    null, false, true, 9, 'Fitment', null, '73.1'),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Cast","Flow-Formed","Forged","Multi-Piece (2pc)","Multi-Piece (3pc)"]'::jsonb,
    null, false, false, 10, 'Specs', null, null),
  (pt_id, 'finish', 'Finish', 'text', null, null,
    null, false, false, 11, 'Specs', null, 'Bronze, Gunmetal, Brushed'),
  (pt_id, 'weight_lbs', 'Weight (per wheel)', 'number', 'lbs', null,
    null, false, true, 12, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 13, 'Source', null, 'Volk, Work, Rays, Enkei, BBS'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 14, 'Source', null, 'TE37, Meister S1, ZE40');

-- ---------------------------------------------------------------------
-- 2. Tires — Performance / Street
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Tires — Performance / Street';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fitment_setup', 'Fitment Setup', 'select', null,
    '["Square (same all 4)","Width-Staggered (different width F/R)","Fully Staggered (different size F/R)"]'::jsonb,
    null, true, false, 1, 'Setup', null, null),
  (pt_id, 'width_mm', 'Width', 'number', 'mm', null,
    null, false, false, 2, 'Front (or All)', null, '245'),
  (pt_id, 'aspect_ratio', 'Aspect Ratio', 'number', '%', null,
    null, false, false, 3, 'Front (or All)', null, '40'),
  (pt_id, 'rim_diameter_in', 'Rim Diameter', 'number', 'in', null,
    null, false, false, 4, 'Front (or All)', null, '18'),
  (pt_id, 'width_rear_mm', 'Rear Width', 'number', 'mm', null,
    null, false, false, 5, 'Rear (if staggered)', null, '275'),
  (pt_id, 'aspect_ratio_rear', 'Rear Aspect Ratio', 'number', '%', null,
    null, false, false, 6, 'Rear (if staggered)', null, null),
  (pt_id, 'rim_diameter_rear_in', 'Rear Rim Diameter', 'number', 'in', null,
    null, false, false, 7, 'Rear (if staggered)', null, null),
  (pt_id, 'compound_type', 'Compound Type', 'select', null,
    '["All-Season","Summer Performance","Max Performance Summer","Track / R-Compound","Drag Radial","Slick (Track-Only)","Drift Specialty"]'::jsonb,
    null, false, false, 8, 'Compound', null, null),
  (pt_id, 'treadwear_rating', 'Treadwear Rating', 'number', null, null,
    null, false, true, 9, 'Specs', null, '200'),
  (pt_id, 'speed_rating', 'Speed Rating', 'text', null, null,
    null, false, true, 10, 'Specs', null, 'Y, W, ZR'),
  (pt_id, 'load_index', 'Load Index', 'number', null, null,
    null, false, true, 11, 'Specs', null, '95'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 12, 'Source', null, 'Michelin, Bridgestone, Yokohama, Continental'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 13, 'Source', null, 'Pilot Sport 4S, RE-71RS, A052');

-- ---------------------------------------------------------------------
-- 3. Tires — Truck / Off-Road
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Tires — Truck / Off-Road';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fitment_setup', 'Fitment Setup', 'select', null,
    '["Square (same all 4)","Width-Staggered","Fully Staggered"]'::jsonb,
    null, true, false, 1, 'Setup', null, null),
  (pt_id, 'overall_diameter_in', 'Overall Diameter', 'number', 'in', null,
    null, false, false, 2, 'Sizing', null, '35'),
  (pt_id, 'width_in', 'Width', 'number', 'in', null,
    null, false, false, 3, 'Sizing', null, '12.50'),
  (pt_id, 'rim_diameter_in', 'Rim Diameter', 'number', 'in', null,
    null, false, false, 4, 'Sizing', null, '17'),
  (pt_id, 'terrain_type', 'Terrain Type', 'select', null,
    '["Highway","All-Terrain (A/T)","Mud Terrain (M/T)","Rugged Terrain (R/T)","Sand","Rock Crawler"]'::jsonb,
    null, false, false, 5, 'Type', null, null),
  (pt_id, 'load_range', 'Load Range', 'select', null,
    '["C (6-ply)","D (8-ply)","E (10-ply)","F (12-ply)"]'::jsonb,
    null, false, true, 6, 'Specs', null, null),
  (pt_id, 'has_rim_protection', 'Rim Protection', 'boolean', null, null,
    null, false, true, 7, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'BFGoodrich, Toyo, Nitto, Falken'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Wheel Spacers / Adapters
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Wheel Spacers / Adapters';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'thickness_mm', 'Thickness', 'number', 'mm', null,
    null, false, false, 1, 'Sizing', null, '15'),
  (pt_id, 'spacer_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 2, 'Position', null, null),
  (pt_id, 'bolt_pattern', 'Bolt Pattern', 'text', null, null,
    null, false, false, 3, 'Fitment', null, '5x114.3'),
  (pt_id, 'hub_bore_mm', 'Hub Bore', 'number', 'mm', null,
    null, false, true, 4, 'Fitment', null, null),
  (pt_id, 'is_adapter', 'Bolt Pattern Adapter', 'boolean', null, null,
    null, false, false, 5, 'Type', 'Changes bolt pattern, not just spacing', null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Slip-On","Hubcentric Bolt-On","Adapter (Stud-Through)"]'::jsonb,
    null, false, false, 6, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Eibach, H&R, ICHIBA, Project Kics'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Lug Nuts / Wheel Studs (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Lug Nuts / Wheel Studs';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'component', 'Component', 'select', null,
    '["Lug Nuts Only","Wheel Studs Only","Both"]'::jsonb,
    null, true, false, 1, 'Component', null, null),
  (pt_id, 'lug_thread', 'Thread Size', 'text', null, null,
    null, false, false, 2, 'Specs', null, 'M12x1.25, 12x1.5, 1/2-20'),
  (pt_id, 'lug_seat', 'Seat Type', 'select', null,
    '["Cone (Acorn)","Ball (Spherical)","Mag (Flat)","Tuner"]'::jsonb,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'is_extended', 'Extended Studs', 'boolean', null, null,
    null, false, false, 4, 'Specs', 'For use with spacers', null),
  (pt_id, 'is_locking', 'Locking Lugs', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["Steel","Aluminum","Titanium","Forged Steel"]'::jsonb,
    null, false, false, 6, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Project Kics, Muteki, ARP, Rays'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, 'R40, SR48');

-- ---------------------------------------------------------------------
-- 6. Hub-Centric Rings (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Hub-Centric Rings';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'wheel_bore_mm', 'Wheel Bore (Outer)', 'number', 'mm', null,
    null, false, false, 1, 'Sizing', null, '73.1'),
  (pt_id, 'hub_bore_mm', 'Hub Bore (Inner)', 'number', 'mm', null,
    null, false, false, 2, 'Sizing', null, '60.1'),
  (pt_id, 'ring_material', 'Material', 'select', null,
    '["Plastic / Polycarbonate","Aluminum","Steel"]'::jsonb,
    null, false, false, 3, 'Type', null, null);

-- ---------------------------------------------------------------------
-- 7. Wheel Bearings / Hub Assembly (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Wheels & Tires' and name = 'Wheel Bearings / Hub Assembly';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bearing_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'bearing_type', 'Bearing Type', 'select', null,
    '["OEM Replacement","Sealed Race Bearing","Full Hub Assembly Upgrade","Solid Race Hub"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'SKF, Timken, GKTECH, OEM'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Wheels & Tires seed complete: 7 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.6: FORCED INDUCTION (10 part_types)
-- =====================================================================
-- Plain English: Spec templates for boost-related parts. Turbo, super-
-- charger, intercooler, BOV, wastegate, plus boost controller, charge
-- pipes, solenoid, air-to-water, and turbo manifold (hot side).
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Turbocharger
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Turbocharger';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'turbo_config', 'Configuration', 'select', null,
    '["Single","Twin (Parallel)","Twin (Sequential)","Twin-Scroll","Compound","Variable Geometry (VGT/VNT)"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'frame_size', 'Frame Size', 'text', null, null,
    null, false, false, 2, 'Specs', null, 'GTX3582R, EFR 8474, G35'),
  (pt_id, 'compressor_wheel_mm', 'Compressor Wheel Size', 'number', 'mm', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'turbine_wheel_mm', 'Turbine Wheel Size', 'number', 'mm', null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'compressor_ar', 'Compressor A/R', 'text', null, null,
    null, false, true, 5, 'Specs', null, '0.70'),
  (pt_id, 'turbine_ar', 'Turbine A/R', 'text', null, null,
    null, false, true, 6, 'Specs', null, '0.63'),
  (pt_id, 'bearing_type', 'Bearing Type', 'select', null,
    '["Journal","Ball Bearing","Dual Ceramic Ball"]'::jsonb,
    null, false, false, 7, 'Specs', null, null),
  (pt_id, 'is_water_cooled', 'Water-Cooled CHRA', 'boolean', null, null,
    null, false, false, 8, 'Specs', null, null),
  (pt_id, 'target_boost_psi', 'Target Boost', 'number', 'psi', null,
    'pressure', false, false, 9, 'Performance', null, '20'),
  (pt_id, 'max_hp_rating', 'Max Power Rating', 'number', 'hp', null,
    null, false, false, 10, 'Performance', null, '600'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 11, 'Source', null, 'Garrett, BorgWarner, Precision, Tomei'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 12, 'Source', null, 'G35-900, EFR 9180');

-- ---------------------------------------------------------------------
-- 2. Supercharger
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Supercharger';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'sc_type', 'Supercharger Type', 'select', null,
    '["Roots-Type","Twin-Screw","Centrifugal","Vortech-Style","V-Style"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'pulley_size_in', 'Pulley Size', 'number', 'in', null,
    null, false, false, 2, 'Specs', 'Smaller pulley = more boost', null),
  (pt_id, 'target_boost_psi', 'Target Boost', 'number', 'psi', null,
    'pressure', false, false, 3, 'Performance', null, null),
  (pt_id, 'max_hp_rating', 'Max Power Rating', 'number', 'hp', null,
    null, false, false, 4, 'Performance', null, null),
  (pt_id, 'has_intercooler', 'Integrated Intercooler', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Vortech, Eaton, Whipple, Magnuson'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, 'V-3, M62, 2.9L');

-- ---------------------------------------------------------------------
-- 3. Intercooler
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Intercooler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'ic_type', 'Intercooler Type', 'select', null,
    '["Front-Mount (FMIC)","Top-Mount (TMIC)","Side-Mount (SMIC)","Air-to-Water"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'core_thickness_mm', 'Core Thickness', 'number', 'mm', null,
    null, false, false, 2, 'Sizing', null, null),
  (pt_id, 'core_height_mm', 'Core Height', 'number', 'mm', null,
    null, false, true, 3, 'Sizing', null, null),
  (pt_id, 'core_length_mm', 'Core Length', 'number', 'mm', null,
    null, false, true, 4, 'Sizing', null, null),
  (pt_id, 'core_design', 'Core Design', 'select', null,
    '["Bar & Plate","Tube & Fin","Cast End-Tank","Welded End-Tank"]'::jsonb,
    null, false, true, 5, 'Specs', null, null),
  (pt_id, 'inlet_outlet_size_in', 'Inlet/Outlet Size', 'text', null, null,
    null, false, false, 6, 'Specs', null, '2.5", 3"'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Garrett, Mishimoto, Process West, ETS'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Blow-off Valve / Bypass Valve
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Blow-off Valve / Bypass Valve';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'valve_type', 'Valve Type', 'select', null,
    '["Atmospheric BOV","Recirculating Diverter Valve","Hybrid (Switchable)","OEM Replacement Diverter"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Aluminum","Stainless Steel","Composite"]'::jsonb,
    null, false, true, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'HKS, TiAL, Forge, Greddy, Turbosmart'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, 'SSQV, Q, RS, TS');

-- ---------------------------------------------------------------------
-- 5. Wastegate
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Wastegate';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'wg_type', 'Wastegate Type', 'select', null,
    '["Internal","External"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'wg_size_mm', 'Wastegate Size', 'number', 'mm', null,
    null, false, false, 2, 'Specs', 'For external wastegates', '44'),
  (pt_id, 'spring_pressure_psi', 'Spring Pressure', 'number', 'psi', null,
    'pressure', false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'TiAL, Turbosmart, Precision, HKS'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, 'MV-S');

-- ---------------------------------------------------------------------
-- 6. Boost Controller
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Boost Controller';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'controller_type', 'Type', 'select', null,
    '["Manual Boost Controller (MBC)","Electronic Boost Controller (EBC)","ECU-Integrated","Hybrid"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_multiple_maps', 'Multiple Boost Maps', 'boolean', null, null,
    null, false, false, 2, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'AEM, Greddy, HKS, Turbosmart'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Tru-Boost, Profec, EVC');

-- ---------------------------------------------------------------------
-- 7. Charge Piping
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Charge Piping';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pipe_section', 'Section', 'multiselect', null,
    '["Cold Side (IC to Throttle)","Hot Side (Turbo to IC)","Both","Custom Routing"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'pipe_material', 'Material', 'select', null,
    '["Aluminum","Stainless Steel","Silicone","Carbon Fiber"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'pipe_diameter_in', 'Pipe Diameter', 'text', null, null,
    null, false, false, 3, 'Specs', null, '2.5", 3", Stepped 2.5"-3"'),
  (pt_id, 'coupler_type', 'Coupler Type', 'select', null,
    '["Silicone","Hump Coupler","V-Band Clamp"]'::jsonb,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Process West, ETS, Mishimoto'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Boost Solenoid (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Boost Solenoid';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'solenoid_type', 'Type', 'select', null,
    '["OEM Replacement","3-Port","4-Port","Aftermarket Performance"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, 'MAC, OEM Subaru, Hella'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Air-to-Water Setup (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Air-to-Water Setup';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'system_components', 'System Includes', 'multiselect', null,
    '["Heat Exchanger","Reservoir","Pump","Lines","Controller","Pre-Cool Spray"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'reservoir_capacity_l', 'Reservoir Capacity', 'number', 'L', null,
    null, false, true, 2, 'Specs', null, null),
  (pt_id, 'pump_flow_gpm', 'Pump Flow Rate', 'number', 'gpm', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'has_ice_capability', 'Ice / Pre-Cool Compatible', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Frozen Boost, PWR, Plazmaman'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Turbo Exhaust Manifold (Hot Side) (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Forced Induction' and name = 'Turbo Exhaust Manifold (Hot Side)';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'manifold_design', 'Design', 'select', null,
    '["Cast (Log Manifold)","Cast (Equal-Length)","Tubular (Stainless)","Tubular (Inconel)","T4 / V-Band Flange"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'flange_type', 'Turbo Flange', 'select', null,
    '["T2","T3","T4 Single","T4 Twin Scroll","V-Band","Custom"]'::jsonb,
    null, true, false, 2, 'Specs', null, null),
  (pt_id, 'has_external_wg_provision', 'External Wastegate Provision', 'boolean', null, null,
    null, true, false, 3, 'Specs', null, null),
  (pt_id, 'primary_diameter_mm', 'Primary Tube Diameter', 'number', 'mm', null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'coating', 'Coating', 'select', null,
    '["None","Ceramic","Wrap","Header Wrap","Black Coating"]'::jsonb,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Tomei EXPREME, Full Race, Doc Race'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

raise notice 'Forced Induction seed complete: 10 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.7: EXHAUST (9 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Headers / Exhaust Manifold (NA — turbo manifold lives in FI)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Headers / Exhaust Manifold';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'header_design', 'Design', 'select', null,
    '["Shorty / Tri-Y","Long-Tube","4-1","4-2-1","Tri-Y","Equal-Length","Unequal-Length"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'primary_diameter_mm', 'Primary Tube Diameter', 'number', 'mm', null,
    null, false, true, 2, 'Specs', null, null),
  (pt_id, 'primary_length_mm', 'Primary Tube Length', 'number', 'mm', null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'collector_size', 'Collector Size', 'text', null, null,
    null, false, true, 4, 'Specs', null, '2.5", 3"'),
  (pt_id, 'header_material', 'Material', 'select', null,
    '["Mild Steel","Stainless Steel (304)","Stainless Steel (321)","Inconel","Titanium"]'::jsonb,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'header_coating', 'Coating', 'select', null,
    '["None","Ceramic Coated","Wrapped","Black Coated"]'::jsonb,
    null, false, false, 6, 'Specs', null, null),
  (pt_id, 'has_o2_bungs', 'O2 Sensor Bungs', 'boolean', null, null,
    null, false, true, 7, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'Tomei, Skunk2, DC Sports, ARK'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, 'EXPREME, Tri-Y');

-- ---------------------------------------------------------------------
-- 2. Downpipe / Frontpipe
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Downpipe / Frontpipe';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'dp_diameter_in', 'Diameter', 'text', null, null,
    null, false, false, 1, 'Sizing', null, '3", 3.5"'),
  (pt_id, 'cat_setup', 'Catalyst Setup', 'select', null,
    '["High-Flow Catted","Catless / Test Pipe","OEM Cat Replacement"]'::jsonb,
    null, true, false, 2, 'Type', null, null),
  (pt_id, 'dp_design', 'Design', 'select', null,
    '["Bellmouth","Divorced (Twin-Scroll)","Single-Pipe","Two-Bolt Flange","V-Band"]'::jsonb,
    null, false, false, 3, 'Type', null, null),
  (pt_id, 'dp_material', 'Material', 'select', null,
    '["Mild Steel","Stainless Steel (304)","Inconel","Titanium"]'::jsonb,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Cobb, Invidia, Tomei, ETS'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Catback System
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Catback System';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'catback_type', 'Catback Type', 'select', null,
    '["Single Exit","Dual Exit","Quad Exit","Side Exit","Race / Open"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'pipe_diameter_in', 'Pipe Diameter', 'text', null, null,
    null, false, false, 2, 'Sizing', null, '2.5", 3", Stepped 2.5"-3"'),
  (pt_id, 'catback_material', 'Material', 'select', null,
    '["Aluminized Steel","Stainless Steel (304)","Stainless Steel (T409)","Titanium","Inconel"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'muffler_count', 'Muffler Count', 'number', null, null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'has_resonator', 'Resonator Included', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'sound_level', 'Sound Level', 'select', null,
    '["OEM-Quiet","Mild","Aggressive","Loud","Race-Loud"]'::jsonb,
    null, false, false, 6, 'Sound', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Invidia, Borla, HKS, Magnaflow, Tomei'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 8, 'Source', null, 'N1, S-Type');

-- ---------------------------------------------------------------------
-- 4. Mid-pipe / Test Pipe
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Mid-pipe / Test Pipe';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mid_pipe_design', 'Design', 'select', null,
    '["X-Pipe","H-Pipe","Y-Pipe","Straight (No Crossover)","Test Pipe (Catless)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'pipe_diameter_in', 'Diameter', 'text', null, null,
    null, false, false, 2, 'Sizing', null, '2.5", 3"'),
  (pt_id, 'mid_pipe_material', 'Material', 'select', null,
    '["Mild Steel","Stainless Steel (304)","Stainless Steel (T409)"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_resonator', 'Includes Resonator', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Catalytic Converter
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Catalytic Converter';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cat_type', 'Cat Type', 'select', null,
    '["OEM Cat","High-Flow Cat (Metallic Substrate)","High-Flow Cat (Ceramic Substrate)","Race Cat"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'cell_count', 'Cell Count', 'number', 'cpsi', null,
    null, false, true, 2, 'Specs', null, '200'),
  (pt_id, 'diameter_in', 'Diameter', 'text', null, null,
    null, false, false, 3, 'Sizing', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Magnaflow, Vibrant, Random Tech'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Exhaust Tips
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Exhaust Tips';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'tip_style', 'Style', 'select', null,
    '["Single Wall","Double Wall","Rolled Edge","Carbon Fiber Tip","Slash Cut","Burnt Tip"]'::jsonb,
    null, false, false, 1, 'Style', null, null),
  (pt_id, 'tip_count', 'Number of Tips', 'number', null, null,
    null, false, false, 2, 'Specs', null, '2'),
  (pt_id, 'inlet_diameter_in', 'Inlet Diameter', 'text', null, null,
    null, false, true, 3, 'Sizing', null, null),
  (pt_id, 'outlet_diameter_in', 'Outlet Diameter', 'text', null, null,
    null, false, false, 4, 'Sizing', null, '4"'),
  (pt_id, 'tip_finish', 'Finish', 'select', null,
    '["Stainless Polished","Stainless Brushed","Black","Carbon Fiber","Burnt / Blue Tip","Titanium"]'::jsonb,
    null, false, false, 5, 'Finish', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Muffler (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Muffler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'muffler_design', 'Design', 'select', null,
    '["Straight-Through","Chambered","Glasspack","Hybrid"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'inlet_diameter_in', 'Inlet Diameter', 'text', null, null,
    null, false, false, 2, 'Sizing', null, '2.5"'),
  (pt_id, 'outlet_diameter_in', 'Outlet Diameter', 'text', null, null,
    null, false, false, 3, 'Sizing', null, '3"'),
  (pt_id, 'muffler_material', 'Material', 'select', null,
    '["Aluminized Steel","Stainless Steel","Titanium"]'::jsonb,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'sound_level', 'Sound Level', 'select', null,
    '["OEM-Quiet","Mild","Aggressive","Loud","Race-Loud"]'::jsonb,
    null, false, false, 5, 'Sound', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Magnaflow, Borla, Flowmaster, Vibrant'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Exhaust Cutout (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Exhaust Cutout';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cutout_type', 'Type', 'select', null,
    '["Electric (Switched)","Manual (Cable)","Vacuum-Operated"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'cutout_position', 'Position', 'select', null,
    '["Pre-Cat","Post-Cat","Mid-Pipe","Pre-Muffler"]'::jsonb,
    null, true, false, 2, 'Position', null, null),
  (pt_id, 'diameter_in', 'Diameter', 'text', null, null,
    null, false, false, 3, 'Sizing', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'QTP, Doug Thorley, Granatelli'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Heat Wrap / Coating (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exhaust' and name = 'Heat Wrap / Coating';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'treatment_type', 'Treatment', 'select', null,
    '["Header Wrap","Pipe Wrap","Ceramic Coating","Heat Reflective Tape","Gold Foil"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Headers / Manifold","Downpipe","Mid-Pipe","Catback","Wastegate Dump","Turbo Hot Side"]'::jsonb,
    null, true, false, 2, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'DEI, Thermo-Tec, Cerakote, Jet Hot'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Exhaust seed complete: 9 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.8: COOLING (13 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Radiator
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Radiator';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'radiator_construction', 'Construction', 'select', null,
    '["OEM Plastic Tank","Aluminum Single-Pass","Aluminum Dual-Pass","Aluminum Triple-Pass"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'core_thickness_mm', 'Core Thickness', 'number', 'mm', null,
    null, false, false, 2, 'Specs', null, '40'),
  (pt_id, 'row_count', 'Row Count', 'number', null, null,
    null, false, true, 3, 'Specs', null, '2'),
  (pt_id, 'has_built_in_oil_cooler', 'Built-in Oil Cooler', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Mishimoto, Koyorad, CSF, PWR'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'X-Line');

-- ---------------------------------------------------------------------
-- 2. Oil Cooler
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Oil Cooler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cooler_type', 'Type', 'select', null,
    '["Air-Cooled (Stacked Plate)","Air-Cooled (Tube & Fin)","Oil-to-Water Heat Exchanger"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'row_count', 'Row Count', 'number', null, null,
    null, false, false, 2, 'Specs', null, '19'),
  (pt_id, 'has_thermostatic_bypass', 'Thermostatic Bypass', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_relocation_kit', 'Relocation Kit', 'boolean', null, null,
    null, false, true, 4, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Setrab, Mocal, Mishimoto, Greddy'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Transmission Cooler
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Transmission Cooler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cooler_type', 'Type', 'select', null,
    '["Air-Cooled","Fluid-to-Fluid (Radiator)","External"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_fan', 'Has Cooling Fan', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'B&M, Hayden, Tru-Cool'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Thermostat
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Thermostat';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'thermostat_temp_c', 'Opening Temp', 'number', '°C', null,
    'temp', false, false, 1, 'Specs', null, '82'),
  (pt_id, 'has_jiggle_pin', 'Jiggle Pin / Bleed Hole', 'boolean', null, null,
    null, false, true, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Mishimoto, Stant, OEM'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Water Pump
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Water Pump';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pump_type', 'Type', 'select', null,
    '["OEM Replacement","High-Flow Mechanical","Electric (Standalone)","Electric (Auxiliary)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'flow_rate_gpm', 'Flow Rate', 'number', 'gpm', null,
    null, false, true, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Davies Craig, Meziere, EWP, Stewart'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Cooling Fan
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Cooling Fan';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fan_type', 'Fan Type', 'select', null,
    '["Electric (Pull)","Electric (Push)","Slim Electric Profile","Dual Electric Setup","Mechanical (Clutch)","Mechanical (Direct)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'diameter_in', 'Diameter', 'number', 'in', null,
    null, false, false, 2, 'Sizing', null, '16'),
  (pt_id, 'cfm_rating', 'CFM Rating', 'number', null, null,
    null, false, true, 3, 'Specs', null, '2000'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'SPAL, Mishimoto, Flex-A-Lite'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Coolant Overflow Tank
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Coolant Overflow Tank';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'reservoir_type', 'Type', 'select', null,
    '["OEM Replacement","Aluminum Aftermarket","Pressurized (Swirl Pot)","Catch Tank"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'capacity_l', 'Capacity', 'number', 'L', null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_pressure_cap', 'Has Pressure Cap', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Mishimoto, Radium, Beatrush'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Differential Cooler (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Differential Cooler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'diff_position', 'Position', 'select', null,
    '["Front","Rear","Both"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'has_pump', 'Has Circulating Pump', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_fan', 'Has Cooling Fan', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Setrab, Mocal'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Power Steering Cooler (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Power Steering Cooler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cooler_design', 'Design', 'select', null,
    '["Tube & Fin","Stacked Plate","Loop / Helical"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Coolant Hoses / Silicone Hose Kit (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Coolant Hoses / Silicone Hose Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'hose_material', 'Material', 'select', null,
    '["OEM Rubber","Silicone","Reinforced Silicone","Stainless Braided"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Upper Radiator","Lower Radiator","Heater Core","Bypass","Coolant Reservoir","Full System Kit"]'::jsonb,
    null, true, false, 2, 'Coverage', null, null),
  (pt_id, 'color', 'Color', 'text', null, null,
    null, false, false, 3, 'Specs', null, 'Black, Red, Blue'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Mishimoto, Samco, HPS'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 11. Coolant / Antifreeze (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Coolant / Antifreeze';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'coolant_type', 'Type', 'select', null,
    '["OAT (Orange)","HOAT (Yellow/Green)","Traditional Green","Race Coolant (No Glycol)","Water + Wetter"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_water_wetter', 'Water Wetter Additive', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'dilution_pct', 'Dilution %', 'number', '%', null,
    null, false, true, 3, 'Specs', null, '50'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Evans Waterless, Redline WaterWetter, Engine Ice'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 12. Heat Exchanger (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Heat Exchanger';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'exchanger_purpose', 'Purpose', 'select', null,
    '["Air-to-Water Intercooler Loop","Engine Oil-to-Water","Trans Oil-to-Water","Universal"]'::jsonb,
    null, true, false, 1, 'Purpose', null, null),
  (pt_id, 'core_size', 'Core Size', 'text', null, null,
    null, false, true, 2, 'Sizing', null, '10x10x2'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 13. Bumper Cooling Mods (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Cooling' and name = 'Bumper Cooling Mods';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mod_type', 'Modification', 'multiselect', null,
    '["Front Splitter Vents","Bumper Inlet Cut","Brake Cooling Ducts","Hood Vents (Functional)","Wheel Well Liners Removed","Custom Ducting"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

raise notice 'Cooling seed complete: 13 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.9: FUEL SYSTEM (8 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Fuel Injectors
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Injectors';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'flow_rate_cc', 'Flow Rate', 'number', 'cc/min', null,
    null, false, false, 1, 'Sizing',
    'cc/min flow rate. e.g. 1000cc ≈ 95 lb/hr', '1000'),
  (pt_id, 'injector_type', 'Injector Type', 'select', null,
    '["Top-Feed","Side-Feed","Direct Injection"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'impedance', 'Impedance', 'select', null,
    '["High-Z (Saturated)","Low-Z (Peak & Hold)"]'::jsonb,
    null, false, true, 3, 'Type', null, null),
  (pt_id, 'connector_type', 'Connector Type', 'text', null, null,
    null, false, true, 4, 'Type', null, 'EV1, EV6, USCAR'),
  (pt_id, 'fuel_compatibility', 'Fuel Compatibility', 'multiselect', null,
    '["Gasoline","E85","Methanol","Race Fuel"]'::jsonb,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Injector Dynamics, FIC, DeatschWerks, Bosch'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Fuel Pump
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Pump';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'pump_location', 'Pump Location', 'select', null,
    '["In-Tank","External / Inline","Surge Tank Feed"]'::jsonb,
    null, true, false, 1, 'Location', null, null),
  (pt_id, 'flow_rate_lph', 'Flow Rate', 'number', 'L/hr', null,
    null, false, false, 2, 'Sizing', null, '450'),
  (pt_id, 'pressure_rating_psi', 'Pressure Rating', 'number', 'psi', null,
    'pressure', false, true, 3, 'Sizing', null, null),
  (pt_id, 'is_brushless', 'Brushless', 'boolean', null, null,
    null, false, false, 4, 'Type', null, null),
  (pt_id, 'fuel_compatibility', 'Fuel Compatibility', 'multiselect', null,
    '["Gasoline","E85","Methanol","Race Fuel"]'::jsonb,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Walbro, AEM, DeatschWerks, Radium'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Surge Tank
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Surge Tank';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'capacity_l', 'Capacity', 'number', 'L', null,
    null, false, false, 1, 'Specs', null, '3'),
  (pt_id, 'pump_count', 'Pump Count', 'number', null, null,
    null, false, false, 2, 'Specs', null, '2'),
  (pt_id, 'location', 'Location', 'select', null,
    '["Trunk-Mounted","Engine Bay","Under-Floor","In-Tank Conversion"]'::jsonb,
    null, false, false, 3, 'Mounting', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Radium, Nuke Performance, Aeromotive'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Fuel Pressure Regulator
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Pressure Regulator';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fpr_type', 'Type', 'select', null,
    '["OEM Replacement","Adjustable Aftermarket","Bypass-Style","Returnless"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'max_pressure_psi', 'Max Pressure', 'number', 'psi', null,
    'pressure', false, false, 2, 'Specs', null, null),
  (pt_id, 'has_gauge_port', 'Has Gauge Port', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Aeromotive, Radium, AEM, Turbosmart'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Fuel Lines
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Lines';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'line_material', 'Material', 'select', null,
    '["OEM Steel/Plastic","PTFE-Lined Stainless","Stainless Braided Rubber","Push-Lock Rubber","Nylon"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'line_size', 'Size', 'text', null, null,
    null, false, false, 2, 'Sizing', null, 'AN-6, AN-8, 8mm'),
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Feed Line","Return Line","Both","Full System"]'::jsonb,
    null, true, false, 3, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Earl''s, XRP, Aeroquip, Russell'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Fuel Rail (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Rail';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'rail_construction', 'Construction', 'select', null,
    '["OEM","Billet Aluminum","Billet Stainless","Anodized Aluminum"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'has_gauge_port', 'Has Gauge Port', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_extra_injector_port', 'Extra Injector Provision', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Radium, Nuke Performance, Beatrush'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Fuel Filter (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Filter';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'filter_type', 'Type', 'select', null,
    '["OEM Replacement","High-Flow","E85-Compatible","In-Line Performance"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'micron_rating', 'Micron Rating', 'number', 'μm', null,
    null, false, false, 2, 'Specs', null, '10'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Aeromotive, Walbro, Radium'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Fuel Cell / Race Tank (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Fuel System' and name = 'Fuel Cell / Race Tank';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'capacity_gal', 'Capacity', 'number', 'gal', null,
    null, false, false, 1, 'Specs', null, '15'),
  (pt_id, 'has_foam_baffling', 'Foam Baffling', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'construction', 'Construction', 'select', null,
    '["Aluminum","Steel","Plastic / Polyethylene","FIA-Certified Bladder"]'::jsonb,
    null, true, false, 3, 'Type', null, null),
  (pt_id, 'has_fia_certification', 'FIA Certified', 'boolean', null, null,
    null, false, false, 4, 'Certification', null, null),
  (pt_id, 'has_swirl_pot', 'Internal Swirl Pot', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Fuel Safe, ATL, RCI, Jaz'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

raise notice 'Fuel System seed complete: 8 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.10: ELECTRICAL (8 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Battery
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Battery';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'battery_type', 'Type', 'select', null,
    '["Lead-Acid (OEM)","AGM (Absorbed Glass Mat)","Lithium-Ion (LiFePO4)","Gel Cell","Dry Cell"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'capacity_ah', 'Capacity', 'number', 'Ah', null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'cca_rating', 'Cold Cranking Amps', 'number', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'weight_lbs', 'Weight', 'number', 'lbs', null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'is_relocated', 'Relocated to Trunk/Cabin', 'boolean', null, null,
    null, false, false, 5, 'Mounting', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Odyssey, Antigravity, Optima, Braille'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, 'PC680, ATX-12');

-- ---------------------------------------------------------------------
-- 2. Alternator
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Alternator';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'alternator_type', 'Type', 'select', null,
    '["OEM Replacement","High-Output Aftermarket","Internal Regulator","External Regulator"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'output_amps', 'Output', 'number', 'A', null,
    null, false, false, 2, 'Specs', null, '180'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Mechman, DC Power, Powermaster'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Starter Motor
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Starter Motor';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'starter_type', 'Type', 'select', null,
    '["OEM Replacement","High-Torque Performance","Mini-Starter","Gear-Reduction"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, 'Powermaster, MSD, Tilton'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Wiring Harness
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Wiring Harness';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'harness_scope', 'Scope', 'select', null,
    '["Engine Harness Only","Body Harness Only","Full Vehicle Rewire","Engine + Body","Standalone Harness"]'::jsonb,
    null, true, false, 1, 'Scope', null, null),
  (pt_id, 'harness_purpose', 'Purpose', 'select', null,
    '["Replacement / Repair","Engine Swap Adapter","Race / Stripped","Tucked / Show Quality"]'::jsonb,
    null, false, false, 2, 'Purpose', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Rywire, Wiring Specialties, K-Tuned'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Grounding Kit
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Grounding Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'kit_components', 'Components', 'multiselect', null,
    '["Engine Block to Chassis","Battery Negative","Alternator Ground","Body to Chassis","Strut Tower Grounds"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, 'HKS, Pivot, Mugen, Beatrush'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Voltage Stabilizer
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Voltage Stabilizer';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'stabilizer_type', 'Type', 'select', null,
    '["Capacitor-Based","Active Voltage Stabilizer","Battery Reset / Negative"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, 'Pivot, HKS, Sun Auto'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Capacitor / Power Cap
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Capacitor / Power Cap';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'capacity_farads', 'Capacity', 'number', 'F', null,
    null, false, false, 1, 'Specs', null, '1.5'),
  (pt_id, 'capacitor_purpose', 'Purpose', 'select', null,
    '["Audio System","Engine Management","Both"]'::jsonb,
    null, true, false, 2, 'Purpose', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Rockford Fosgate, Stinger, Kinetik'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Kill Switch / Battery Disconnect
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Electrical' and name = 'Kill Switch / Battery Disconnect';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'switch_type', 'Type', 'select', null,
    '["Manual Battery Disconnect","FIA-Approved Kill Switch","Remote / Solenoid","Master Cutoff"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_external_pull', 'External Pull (Race-Spec)', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Longacre, Cole Hersee, Moroso'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Electrical seed complete: 8 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.11: AUDIO (5 part_types)
-- =====================================================================
-- Sound Deadening lives in Interior, not here (Decision conversation).
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Head Unit
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Audio' and name = 'Head Unit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'unit_type', 'Type', 'select', null,
    '["Single-DIN","Double-DIN","Tablet Integration","OEM Replacement","OEM Bluetooth Adapter","Floating Touchscreen"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'screen_size_in', 'Screen Size', 'number', 'in', null,
    null, false, false, 2, 'Specs', null, '7'),
  (pt_id, 'has_apple_carplay', 'Apple CarPlay', 'boolean', null, null,
    null, false, false, 3, 'Capabilities', null, null),
  (pt_id, 'has_android_auto', 'Android Auto', 'boolean', null, null,
    null, false, false, 4, 'Capabilities', null, null),
  (pt_id, 'has_dsp', 'Built-in DSP', 'boolean', null, null,
    null, false, false, 5, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Pioneer, Kenwood, Alpine, JVC'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Speakers
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Audio' and name = 'Speakers';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'speaker_position', 'Position', 'multiselect', null,
    '["Front Door","Rear Door","Front Tweeters","Rear Tweeters","Dash","Pillar","Trunk","Component Set"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'speaker_size_in', 'Size', 'text', null, null,
    null, false, false, 2, 'Sizing', null, '6.5", Component 6.5+1"'),
  (pt_id, 'watts_rms', 'Power Handling (RMS)', 'number', 'W', null,
    null, false, false, 3, 'Specs', null, '80'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Focal, JL Audio, Hertz, Rockford Fosgate'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Amplifier
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Audio' and name = 'Amplifier';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'amp_channels', 'Channels', 'select', null,
    '["Mono","2-Channel","4-Channel","5-Channel","6+ Channel"]'::jsonb,
    null, true, false, 1, 'Configuration', null, null),
  (pt_id, 'amp_class', 'Class', 'select', null,
    '["Class A/B","Class D","Class GH"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'watts_rms', 'Power Output (RMS)', 'number', 'W', null,
    null, false, false, 3, 'Specs', null, '500'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'JL Audio, Rockford Fosgate, Alpine, Kicker'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Subwoofer
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Audio' and name = 'Subwoofer';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'sub_size_in', 'Size', 'number', 'in', null,
    null, false, false, 1, 'Sizing', null, '12'),
  (pt_id, 'sub_count', 'Number of Subs', 'number', null, null,
    null, false, false, 2, 'Sizing', null, '1'),
  (pt_id, 'enclosure_type', 'Enclosure', 'select', null,
    '["Sealed","Ported / Vented","Bandpass","Free-Air","Custom-Built"]'::jsonb,
    null, false, false, 3, 'Type', null, null),
  (pt_id, 'watts_rms', 'Power Handling (RMS)', 'number', 'W', null,
    null, false, false, 4, 'Specs', null, '500'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'JL Audio, Rockford Fosgate, Sundown, Skar'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. DSP / Signal Processor (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Audio' and name = 'DSP / Signal Processor';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'dsp_channels', 'Channels', 'text', null, null,
    null, false, false, 1, 'Specs', 'Input x Output channel count', '8x12, 6x10'),
  (pt_id, 'has_oem_integration', 'OEM Integration', 'boolean', null, null,
    null, false, false, 2, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Helix, Audison, miniDSP, JL Audio'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Audio seed complete: 5 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.12: LIGHTING (7 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Headlights
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Headlights';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'headlight_type', 'Type', 'select', null,
    '["OEM Replacement Bulbs","OEM-Style Housing Replacement","Aftermarket Housing (LED Bar)","Aftermarket Housing (Projector Style)","Halo Headlights","Sequential Turn Signal Headlights","Retrofit Projectors"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'bulb_type', 'Bulb Type', 'select', null,
    '["Halogen","HID/Xenon","LED","Laser"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'color_temp_k', 'Color Temperature', 'number', 'K', null,
    null, false, false, 3, 'Specs', null, '6000'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Spec-D, Spyder, Anzo, Diode Dynamics'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Tail Lights
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Tail Lights';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'taillight_type', 'Type', 'select', null,
    '["OEM Replacement","Smoked Tint","LED Conversion","Sequential Turn Signals","Aftermarket Housing","Euro / Altezza Style"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'bulb_type', 'Bulb Type', 'select', null,
    '["Halogen","LED"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Fog Lights
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Fog Lights';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fog_position', 'Position', 'select', null,
    '["Front Bumper","Rear Bumper","Both","Roof / Light Bar"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'bulb_type', 'Bulb Type', 'select', null,
    '["Halogen","HID","LED"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'color_temp_k', 'Color Temperature', 'number', 'K', null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'PIAA, Hella, Diode Dynamics, Rigid'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Interior Lighting
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Interior Lighting';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Dome Light","Map Lights","Footwell","Trunk","Glove Box","Door Sills","Ambient / Strip Lighting"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'bulb_type', 'Bulb Type', 'select', null,
    '["LED Bulb Replacement","RGB Strip","RGB Controllable","Halogen Replacement"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_app_control', 'App / Bluetooth Controlled', 'boolean', null, null,
    null, false, false, 3, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Underglow
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Underglow';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'underglow_type', 'Type', 'select', null,
    '["LED Strip","Hard Bar","Tube Lighting"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'color_capability', 'Color Capability', 'select', null,
    '["Single Color","RGB","RGBW","Music-Reactive"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_app_control', 'App Controlled', 'boolean', null, null,
    null, false, false, 3, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'LEDGlow, OPT7, Vision X'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Light Bar / Aux Lights (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Light Bar / Aux Lights';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bar_type', 'Type', 'select', null,
    '["Roof-Mounted Light Bar","Bumper-Mounted","A-Pillar Pods","Hood-Mounted","Off-Road Spot Lights"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'bar_length_in', 'Length', 'number', 'in', null,
    null, false, false, 2, 'Sizing', null, '50'),
  (pt_id, 'beam_pattern', 'Beam Pattern', 'select', null,
    '["Spot","Flood","Combo (Spot + Flood)","Driving"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Rigid Industries, Baja Designs, Diode Dynamics'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Side Markers / Bumper Lights (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Lighting' and name = 'Side Markers / Bumper Lights';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'marker_type', 'Type', 'select', null,
    '["Clear / Crystal Markers (JDM Style)","Smoked Markers","LED Replacement","OEM Replacement"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'marker_position', 'Position', 'multiselect', null,
    '["Front Bumper","Rear Bumper","Fender","All"]'::jsonb,
    null, true, false, 2, 'Position', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Lighting seed complete: 7 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.13: SAFETY (8 part_types)
-- =====================================================================
-- expiry_date specs trigger the safety reminder auto-creation
-- (Decision 020 / migration 025 Section G).
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Harness / Seatbelt
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Harness / Seatbelt';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'harness_type', 'Harness Type', 'select', null,
    '["OEM 3-Point","OEM 3-Point + Cam-Lock","4-Point","5-Point","6-Point"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'harness_position', 'Position', 'select', null,
    '["Driver Only","Passenger Only","Both"]'::jsonb,
    null, false, false, 2, 'Position', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["None / Street","FIA 8853-2016","SFI 16.1","SFI 16.5"]'::jsonb,
    null, false, false, 3, 'Certification', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 4, 'Compliance',
    'Auto-creates a reminder when set', null),
  (pt_id, 'width_in', 'Belt Width', 'number', 'in', null,
    null, false, true, 5, 'Specs', null, '3'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Schroth, Sabelt, Sparco, OMP'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Roll Bar / Roll Cage
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Roll Bar / Roll Cage';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cage_design', 'Design', 'select', null,
    '["Roll Bar (4-Point)","Roll Bar (6-Point)","Half Cage","Full Cage (8-Point)","Full Cage (10+ Point)","NASCAR-Style"]'::jsonb,
    null, true, false, 1, 'Design', null, null),
  (pt_id, 'cage_material', 'Material', 'select', null,
    '["DOM Steel","Chromoly (4130)","Mild Steel"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'tube_diameter_in', 'Tube Diameter', 'text', null, null,
    null, false, false, 3, 'Specs', null, '1.75"'),
  (pt_id, 'has_door_bars', 'Door Bars (NASCAR/X)', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'has_harness_bar', 'Integrated Harness Bar', 'boolean', null, null,
    null, false, false, 5, 'Specs', null, null),
  (pt_id, 'is_padded', 'Padded (SFI/FIA)', 'boolean', null, null,
    null, false, false, 6, 'Specs', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["None / DIY","FIA Approved","SCCA Logbook","NASA Logbook","NHRA Certified"]'::jsonb,
    null, false, false, 7, 'Certification', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 8, 'Source', null, 'Autopower, Brey-Krause, Custom Cages'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 9, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Helmet
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Helmet';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'helmet_type', 'Type', 'select', null,
    '["Open-Face","Full-Face","Closed-Face (Drag)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["DOT","Snell SA2020","Snell SA2025","FIA 8859-2015","FIA 8860-2018"]'::jsonb,
    null, false, false, 2, 'Certification', null, null),
  (pt_id, 'has_hans_posts', 'HANS Posts (M6)', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_radio_comms', 'Built-in Comms', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 5, 'Compliance',
    'Auto-creates a reminder when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Stilo, Bell, OMP, HJC, Arai'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Fire Suppression System
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Fire Suppression System';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'system_type', 'System Type', 'select', null,
    '["Handheld Extinguisher","Plumbed Manual","Plumbed Electric / Automatic"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'agent_type', 'Agent', 'select', null,
    '["Halon","Novec 1230","AFFF Foam","Dry Chemical","FE-36"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'capacity_lbs', 'Capacity', 'number', 'lbs', null,
    null, false, false, 3, 'Specs', null, '5'),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["None","SFI 17.1","FIA 8865"]'::jsonb,
    null, false, false, 4, 'Certification', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 5, 'Compliance',
    'Auto-creates a reminder when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Lifeline, SPA Technique, FireBottle'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Window Net
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Window Net';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'net_type', 'Type', 'select', null,
    '["SFI Ribbon Net","FIA Mesh Net","Custom"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["SFI 27.1","FIA 8863-2013"]'::jsonb,
    null, false, false, 2, 'Certification', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 3, 'Compliance',
    'Auto-creates a reminder when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. HANS / Head & Neck Restraint (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'HANS / Head & Neck Restraint';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'device_type', 'Type', 'select', null,
    '["HANS Device","Hybrid (Hybrid Pro / Pro)","R3","Frontal Head Restraint (FHR)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'size', 'Size', 'select', null,
    '["Small","Medium","Large","XL","Custom"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'collar_angle', 'Collar Angle', 'select', null,
    '["20°","30°","40°","Adjustable"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["SFI 38.1","FIA 8858-2010"]'::jsonb,
    null, false, false, 4, 'Certification', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 5, 'Compliance',
    'Auto-creates a reminder when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'HANS, Simpson Hybrid, Schroth R3'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Race Suit / Driver Apparel (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Race Suit / Driver Apparel';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'apparel_components', 'Components', 'multiselect', null,
    '["Race Suit","Gloves","Driving Shoes","Nomex Underwear","Balaclava","Socks"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'certification', 'Certification', 'select', null,
    '["None","SFI 3.2A/1","SFI 3.2A/5","SFI 3.2A/15","FIA 8856-2018"]'::jsonb,
    null, false, false, 2, 'Certification', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 3, 'Compliance',
    'Auto-creates a reminder for FIA-rated apparel when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Sparco, OMP, Alpinestars, K1'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Camera / Data Logger (NEW — track-focused)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Safety' and name = 'Camera / Data Logger';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'device_type', 'Device Type', 'select', null,
    '["Lap Timer","Camera Only","Camera + Lap Timer","Predictive Lap Timer","Multi-Camera Setup"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_gps', 'GPS Enabled', 'boolean', null, null,
    null, false, false, 2, 'Capabilities', null, null),
  (pt_id, 'has_obd_integration', 'OBD Integration', 'boolean', null, null,
    null, false, false, 3, 'Capabilities', null, null),
  (pt_id, 'has_video', 'Records Video', 'boolean', null, null,
    null, false, false, 4, 'Capabilities', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'AiM, Garmin Catalyst, RaceLogic, GoPro'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Solo, SmartyCam');

raise notice 'Safety seed complete: 8 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.14: EXTERIOR (10 part_types)
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Front Bumper / Lip
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Front Bumper / Lip';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bumper_type', 'Type', 'select', null,
    '["OEM","OEM-Style Replacement","Aftermarket Style","Lip Only","Full Conversion"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["Polyurethane","FRP","Carbon Fiber","ABS Plastic","Fiberglass"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Varis, Voltex, APR, Seibon, ChargeSpeed'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 2. Rear Bumper / Diffuser
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Rear Bumper / Diffuser';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'bumper_type', 'Type', 'select', null,
    '["OEM","OEM-Style Replacement","Aftermarket Style","Diffuser Only","Full Conversion"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'has_diffuser', 'Has Diffuser', 'boolean', null, null,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["Polyurethane","FRP","Carbon Fiber","ABS Plastic","Fiberglass"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Varis, Voltex, APR, Seibon'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Side Skirts
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Side Skirts';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'skirt_type', 'Type', 'select', null,
    '["OEM Replacement","Aftermarket Style","Ground Effect / Lip Extender","Full Body Kit Match"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["Polyurethane","FRP","Carbon Fiber","ABS Plastic","Fiberglass"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Fenders / Widebody
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Fenders / Widebody';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fender_type', 'Type', 'select', null,
    '["OEM Replacement","Vented","Pumped/Stretched","Widebody Bolt-On","Widebody Welded"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'fender_material', 'Material', 'select', null,
    '["Steel","Aluminum","FRP","Carbon Fiber","Fiberglass"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'fender_position', 'Position', 'select', null,
    '["Front","Rear","All"]'::jsonb,
    null, true, false, 3, 'Position', null, null),
  (pt_id, 'flare_amount_mm', 'Flare Amount', 'number', 'mm', null,
    null, false, false, 4, 'Specs', null, '50'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Pandem, Rocket Bunny, Liberty Walk, ChargeSpeed'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Hood
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Hood';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'hood_design', 'Design', 'select', null,
    '["OEM Replacement","Cowl Induction","Vented","Two-Tone","Lightweight Race"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'hood_material', 'Material', 'select', null,
    '["Steel/Aluminum OEM","FRP","Carbon Fiber","Forged Carbon","Dry Carbon"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_pins', 'Hood Pins Installed', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Seibon, VIS, Vented Hood, Anderson Composites'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Wing / Spoiler
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Wing / Spoiler';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'wing_type', 'Type', 'select', null,
    '["OEM Spoiler","Lip Spoiler","Pedestal Wing","Swan-Neck Wing","GT Wing","Ducktail"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'wing_material', 'Material', 'select', null,
    '["FRP","Carbon Fiber","ABS Plastic","Aluminum"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'is_adjustable_aoa', 'Adjustable Angle of Attack', 'boolean', null, null,
    null, false, true, 3, 'Specs', null, null),
  (pt_id, 'wing_width_mm', 'Wing Width', 'number', 'mm', null,
    null, false, false, 4, 'Sizing', null, '1700'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'APR, Voltex, Varis, 9 Lives Racing'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Mirror Caps
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Mirror Caps';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'cap_type', 'Type', 'select', null,
    '["OEM Replacement","Carbon Wrap","Carbon Fiber","Painted Match","M-Style / Sport Style"]'::jsonb,
    null, false, false, 1, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 8. Splitter / Aero Underbody (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Splitter / Aero Underbody';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'component', 'Component', 'multiselect', null,
    '["Front Splitter","Underbody Tray","Rear Diffuser","Air Dam","Side Splitters"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'splitter_material', 'Material', 'select', null,
    '["ABS","FRP","Carbon Fiber","Aluminum"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'has_support_rods', 'Support Rods Installed', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'APR, Verus, 9 Lives Racing, ChargeSpeed'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Canards / Dive Planes (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Canards / Dive Planes';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'canard_position', 'Position', 'select', null,
    '["Front Bumper Lower","Front Bumper Upper","Both","Rear Bumper"]'::jsonb,
    null, true, false, 1, 'Position', null, null),
  (pt_id, 'canard_count', 'Count', 'number', null, null,
    null, false, false, 2, 'Specs', null, '4'),
  (pt_id, 'canard_material', 'Material', 'select', null,
    '["ABS","FRP","Carbon Fiber"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Hood Vents (Functional) (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Exterior' and name = 'Hood Vents (Functional)';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'vent_purpose', 'Purpose', 'multiselect', null,
    '["Engine Bay Heat Extraction","Visual Only","Aero (Reduce Lift)","Underhood Aero"]'::jsonb,
    null, true, false, 1, 'Purpose', null, null),
  (pt_id, 'vent_count', 'Count', 'number', null, null,
    null, false, false, 2, 'Specs', null, '2'),
  (pt_id, 'vent_material', 'Material', 'select', null,
    '["ABS","FRP","Carbon Fiber","Aluminum"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Verus, Race Louvers, Anderson Composites'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

raise notice 'Exterior seed complete: 10 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.15: PAINT & WRAP (4 part_types)
-- =====================================================================
-- Ceramic Coating was deleted in the prelude — it's a maintenance task
-- now (Decision 023), not a modification.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Full Paint
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Paint & Wrap' and name = 'Full Paint';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'paint_type', 'Paint Type', 'select', null,
    '["Single-Stage","Base/Clear","Pearl","Metallic","Candy","Matte","Color-Shift","Chameleon","Wrap-Style Vinyl Look"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'color_name', 'Color Name', 'text', null, null,
    null, false, false, 2, 'Color', null, 'Bayside Blue, Nardo Grey'),
  (pt_id, 'color_code', 'Color Code', 'text', null, null,
    null, false, false, 3, 'Color', 'Manufacturer paint code', 'BV2, 7H'),
  (pt_id, 'painter', 'Painter', 'text', null, null,
    null, false, false, 4, 'Source', null, 'DIY or shop name');

-- ---------------------------------------------------------------------
-- 2. Vinyl Wrap
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Paint & Wrap' and name = 'Vinyl Wrap';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'wrap_type', 'Wrap Type', 'select', null,
    '["Full Wrap","Partial Wrap","Roof Only","Hood Only","Color Accent"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'wrap_finish', 'Finish', 'select', null,
    '["Gloss","Satin","Matte","Chrome","Brushed Metal","Carbon Fiber","Color-Shift","Holographic"]'::jsonb,
    null, false, false, 2, 'Finish', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, '3M, Avery Dennison, KPMF, Inozetek'),
  (pt_id, 'color_name', 'Color', 'text', null, null,
    null, false, false, 4, 'Color', null, null),
  (pt_id, 'color_code', 'Color Code', 'text', null, null,
    null, false, false, 5, 'Color', null, null),
  (pt_id, 'installer', 'Installer', 'text', null, null,
    null, false, false, 6, 'Source', null, 'DIY or shop name');

-- ---------------------------------------------------------------------
-- 3. Paint Protection Film
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Paint & Wrap' and name = 'Paint Protection Film';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'ppf_coverage', 'Coverage', 'select', null,
    '["Full Front","Track Pack (Front + Hood + Mirrors)","Full Body","Custom Sections"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'ppf_type', 'PPF Type', 'select', null,
    '["Standard","Self-Healing","Matte Finish","Color-Shift"]'::jsonb,
    null, false, false, 2, 'Type', null, null),
  (pt_id, 'thickness_mil', 'Thickness', 'number', 'mil', null,
    null, false, true, 3, 'Specs', null, '8'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'XPEL, SunTek, 3M, STEK'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Ultimate Plus, Stealth'),
  (pt_id, 'installer', 'Installer', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Partial Respray
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Paint & Wrap' and name = 'Partial Respray';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'sections_painted', 'Sections Painted', 'multiselect', null,
    '["Front Bumper","Rear Bumper","Hood","Trunk","Doors","Fenders","Roof","Mirror Caps"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'color_match_type', 'Color Match', 'select', null,
    '["OEM Match","Custom Color","Two-Tone"]'::jsonb,
    null, false, false, 2, 'Color', null, null),
  (pt_id, 'painter', 'Painter', 'text', null, null,
    null, false, false, 3, 'Source', null, 'DIY or shop name');

raise notice 'Paint & Wrap seed complete: 4 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.16: INTERIOR (12 part_types)
-- =====================================================================
-- Sound Deadening lives here (per conversation), not Audio.
-- Seats with FIA cert get expiry_date triggering safety reminder.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Seats
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Seats';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'seat_type', 'Type', 'select', null,
    '["OEM Replacement","Bolster Reupholster","Bucket Seat (Reclining)","Race Bucket (Fixed Back)","FIA Bucket Seat (Halo)"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'seat_position', 'Position', 'select', null,
    '["Driver Only","Passenger Only","Both"]'::jsonb,
    null, true, false, 2, 'Position', null, null),
  (pt_id, 'seat_material', 'Material', 'select', null,
    '["Leather","Alcantara","Cloth","Vinyl","FRP Shell","Carbon Fiber Shell"]'::jsonb,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'has_harness_pass_through', 'Harness Pass-Through', 'boolean', null, null,
    null, false, false, 4, 'Specs', null, null),
  (pt_id, 'expiry_date', 'Expiry Date', 'date', null, null,
    null, false, false, 5, 'Compliance',
    'For FIA-rated seats — auto-creates a reminder when set', null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 6, 'Source', null, 'Recaro, Sparco, Bride, Status, OMP, Cobra'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 7, 'Source', null, 'Pole Position, Zeta');

-- ---------------------------------------------------------------------
-- 2. Steering Wheel
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Steering Wheel';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'wheel_type', 'Type', 'select', null,
    '["OEM Replacement","Sport Wheel (Aftermarket)","Race Wheel (Suede/Leather)","Detachable Race Wheel","OMP/MOMO Style"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'wheel_diameter_mm', 'Diameter', 'number', 'mm', null,
    null, false, false, 2, 'Sizing', null, '350'),
  (pt_id, 'has_quick_release', 'Quick Release Hub', 'boolean', null, null,
    null, false, false, 3, 'Specs', null, null),
  (pt_id, 'hub_brand', 'Hub Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'NRG, Works Bell, OMP'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 5, 'Source', null, 'Nardi, MOMO, OMP, Personal, Sparco'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 6, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 3. Shift Knob
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Shift Knob';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'knob_material', 'Material', 'select', null,
    '["Aluminum","Stainless Steel","Titanium","Wood","Resin","Crystal/Acrylic","Leather"]'::jsonb,
    null, false, false, 1, 'Specs', null, null),
  (pt_id, 'weight_oz', 'Weight', 'number', 'oz', null,
    null, false, false, 2, 'Specs', null, '8'),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Skunk2, Mishimoto, Mugen, Cusco, Blox'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 4. Gauges / Pods
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Gauges / Pods';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'gauge_count', 'Number of Gauges', 'number', null, null,
    null, false, false, 1, 'Specs', null, '3'),
  (pt_id, 'gauge_purposes', 'What They Measure', 'multiselect', null,
    '["Boost","Oil Pressure","Oil Temp","Water Temp","EGT","Fuel Pressure","AFR","Battery Voltage","Tachometer"]'::jsonb,
    null, false, false, 2, 'Functions', null, null),
  (pt_id, 'pod_location', 'Pod Location', 'multiselect', null,
    '["A-Pillar","Steering Column","Center Console","Dash Top","Vent Replacement"]'::jsonb,
    null, false, false, 3, 'Mounting', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, 'Defi, AEM, ProSport, Innovate, Greddy'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 5, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 5. Dash Kit
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Dash Kit';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'kit_finish', 'Finish', 'select', null,
    '["Wood","Carbon Fiber","Aluminum","Painted Match","Alcantara"]'::jsonb,
    null, true, false, 1, 'Finish', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 3, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 6. Door Panels
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Door Panels';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'panel_type', 'Type', 'select', null,
    '["OEM Replacement","Re-Trimmed","Race / Stripped Cards","Lightweight Composite"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["OEM Plastic","Leather","Alcantara","Carbon Fiber","Aluminum"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 7. Window Tint
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Window Tint';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'tint_coverage', 'Coverage', 'multiselect', null,
    '["Front Two","Rear Two","Rear Windshield","Windshield Strip","Full Wrap"]'::jsonb,
    null, true, false, 1, 'Coverage', null, null),
  (pt_id, 'tint_percentage', 'VLT %', 'number', '%', null,
    null, false, false, 2, 'Specs', 'Visible Light Transmission', '20'),
  (pt_id, 'tint_type', 'Type', 'select', null,
    '["Dyed","Hybrid","Carbon","Ceramic","Crystalline"]'::jsonb,
    null, false, false, 3, 'Type', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 4, 'Source', null, '3M, Llumar, XPEL Prime, SunTek'),
  (pt_id, 'installer', 'Installer', 'text', null, null,
    null, false, false, 5, 'Source', null, 'DIY or shop');

-- ---------------------------------------------------------------------
-- 8. Sound Deadening
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Sound Deadening';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'deadening_material', 'Material', 'select', null,
    '["Butyl Rubber Mat (Dynamat-style)","MLV (Mass Loaded Vinyl)","Closed-Cell Foam","Hydrophobic Sheet","Combination"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Doors","Floor","Trunk","Roof","Firewall","Wheel Wells","Full Cabin"]'::jsonb,
    null, true, false, 2, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Dynamat, SoundSkins, Kilmat, Hushmat'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 9. Pedals (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Pedals';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'component', 'Component', 'multiselect', null,
    '["Gas Pedal Cover","Brake Pedal Cover","Clutch Pedal Cover","Dead Pedal","Full Pedal Box","Floor-Mounted Pedal Conversion"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'material', 'Material', 'select', null,
    '["Aluminum","Stainless Steel","Rubber-Wrapped","Drilled Aluminum"]'::jsonb,
    null, false, false, 2, 'Specs', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'Mugen, Tilton, Wilwood, Spoon'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 10. Floor Mats (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Floor Mats';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'mat_type', 'Type', 'select', null,
    '["OEM Replacement","All-Weather","Race / Lightweight","Plush Carpet","Custom Embroidered"]'::jsonb,
    null, true, false, 1, 'Type', null, null),
  (pt_id, 'coverage', 'Coverage', 'multiselect', null,
    '["Front Only","All Four","Trunk Mat","Cargo Liner"]'::jsonb,
    null, false, false, 2, 'Coverage', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, 'WeatherTech, Husky, Sparco, OMP'),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

-- ---------------------------------------------------------------------
-- 11. Headliner (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Headliner';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'headliner_action', 'Action', 'select', null,
    '["Replaced (OEM Match)","Re-Wrapped (Alcantara)","Re-Wrapped (Suede)","Painted","Removed (Race)"]'::jsonb,
    null, true, false, 1, 'Action', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 2, 'Source', null, null),
  (pt_id, 'installer', 'Installer', 'text', null, null,
    null, false, false, 3, 'Source', null, 'DIY or shop name');

-- ---------------------------------------------------------------------
-- 12. Comfort Delete (NEW)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Interior' and name = 'Comfort Delete';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'deleted_components', 'Deleted Components', 'multiselect', null,
    '["A/C System","Heater Core","Power Steering","Power Windows / Locks","Sound Deadening (Removed)","Carpet","Rear Seats","Spare Tire / Jack","Sunroof"]'::jsonb,
    null, true, false, 1, 'Components', null, null),
  (pt_id, 'weight_reduced_lbs', 'Weight Reduced', 'number', 'lbs', null,
    null, false, false, 2, 'Specs', null, '85'),
  (pt_id, 'reason', 'Reason', 'select', null,
    '["Track / Race Use","Drag Build","Drift Build","Restoration"]'::jsonb,
    null, false, false, 3, 'Purpose', null, null);

raise notice 'Interior seed complete: 12 part_types';

end $$;


-- =====================================================================
-- 026 Section 4.17: OTHER (2 part_types)
-- =====================================================================
-- Minimal templates. Most info comes from jobs.title, description, notes.
-- Section 5 verification skips Other category for the empty-templates check.
-- =====================================================================

do $$
declare
  pt_id integer;
begin

-- ---------------------------------------------------------------------
-- 1. Custom Fabrication
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Other' and name = 'Custom Fabrication';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'fab_category', 'Category Hint', 'select', null,
    '["Engine","Drivetrain","Suspension","Brakes","Aero / Body","Interior","Other"]'::jsonb,
    null, false, false, 1, 'Categorization',
    'Helps organize this on your Build Sheet', null),
  (pt_id, 'fab_complexity', 'Fabrication Complexity', 'select', null,
    '["Bolt-On + Light Mod","Welding Required","Custom Fabricated Part","Major Modification"]'::jsonb,
    null, false, false, 2, 'Scope', null, null),
  (pt_id, 'fabricator', 'Fabricator', 'text', null, null,
    null, false, false, 3, 'Source', null, 'DIY or shop name');

-- ---------------------------------------------------------------------
-- 2. Other (catch-all)
-- ---------------------------------------------------------------------
select id into strict pt_id from public.part_types
  where category = 'Other' and name = 'Other';

insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
   required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id, 'other_category', 'Category Hint', 'select', null,
    '["Engine","Drivetrain","Suspension","Brakes","Wheels & Tires","Forced Induction","Exhaust","Cooling","Fuel System","Electrical","Audio","Lighting","Safety","Exterior","Interior","Other"]'::jsonb,
    null, false, false, 1, 'Categorization',
    'Helps organize this on your Build Sheet', null),
  (pt_id, 'installation_complexity', 'Installation Complexity', 'select', null,
    '["Bolt-On","Bolt-On + Wiring","Custom Fabrication Required","Major Modification"]'::jsonb,
    null, false, false, 2, 'Scope', null, null),
  (pt_id, 'brand', 'Brand', 'text', null, null,
    null, false, false, 3, 'Source', null, null),
  (pt_id, 'model_text', 'Model', 'text', null, null,
    null, false, false, 4, 'Source', null, null);

raise notice 'Other seed complete: 2 part_types';

end $$;



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
