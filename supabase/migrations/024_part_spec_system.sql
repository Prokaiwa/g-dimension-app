-- =============================================================================
-- G-DIMENSION — Migration 024: Part Spec System
-- =============================================================================
-- The most feature-rich migration in the project. Adds a fully data-driven
-- spec collection system for modifications.
--
-- ARCHITECTURE:
--   part_types     → catalog of all selectable part types per category
--   spec_templates → what fields each part type collects (the "brain")
--   job_specs      → actual values the user enters per job
--
-- HOW THE SMART FORM WORKS:
--   1. User picks Category: "Engine"
--   2. User picks Part Type: "Camshafts"
--   3. App queries spec_templates WHERE part_type_id = [camshafts]
--   4. Form renders: Intake Duration, Exhaust Duration, LSA, Lift, etc.
--   5. User fills in values → saved to job_specs
--   Adding a new part type = insert rows into spec_templates. Zero code changes.
--
-- PROGRESSIVE DISCLOSURE:
--   spec_templates.is_advanced = false → shown in basic view (default)
--   spec_templates.is_advanced = true  → shown only when user taps "+ Advanced"
--   The DB stores everything. The form reveals itself progressively.
--
-- BASE UNITS (stored, converted at display):
--   Spring rate  → kg/mm   (user pref: kgmm / lbin,  1 kg/mm = 56.0 lb/in)
--   Boost/Press  → psi     (user pref: psi / bar,     1 psi = 0.0689 bar)
--   Temperature  → °C      (user pref: c / f,         °C × 9/5 + 32 = °F)
--   Small length → mm      (universal for parts — NOT converted via distance_unit)
--   Wheel dim    → inches for diameter/width, mm for offset/center bore
--   Tire (metric)→ mm/ratio/inches (universal)
--   Tire (truck) → inches overall / inches width / inches rim
--
-- CROSS-FILE CHANGES IN THIS MIGRATION:
--   + Alters users (new unit prefs: spring_rate_unit, pressure_unit, temp_unit)
--   + Alters jobs (part_type_id, donor fields, modification_goals, etc.)
--   + Alters car_reminders (source_job_id + adds 'safety' category)
--   + Replaces jobs_handle_removal trigger (copies specs + new fields)
--   + Replaces public_build_sheet view (adds non-sensitive new job columns)
-- =============================================================================

-- =============================================================================
-- STEP 1: part_types table
-- Must be created BEFORE altering jobs to add the part_type_id FK.
-- =============================================================================

create table if not exists public.part_types (
  id            serial primary key,
  category      text not null,
  -- Matches jobs.category values:
  -- modification: Engine, Drivetrain, Suspension, Brakes, Wheels & Tires,
  --   Exhaust, Cooling, Fuel System, Electrical, Audio, Safety,
  --   Exterior, Paint & Wrap, Interior, Other
  name          text not null,          -- "Camshafts", "Coilovers", "Turbocharger"
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (category, name)
);

comment on table  public.part_types is 'Catalog of selectable part types per category. Drives spec_templates lookup.';
comment on column public.part_types.category is 'Matches jobs.category. Used to filter part types in the Add Modification form.';

create index if not exists part_types_category
  on public.part_types (category, display_order);

-- =============================================================================
-- STEP 2: spec_templates table
-- Defines what fields each part type collects.
-- One row = one field in the dynamic form.
-- =============================================================================

create table if not exists public.spec_templates (
  id              serial primary key,
  part_type_id    integer not null references public.part_types(id) on delete cascade,

  -- Field identity
  spec_key        text not null,          -- machine name: "intake_duration"
  spec_label      text not null,          -- human label:  "Intake Duration"

  -- Input behavior
  input_type      text not null
                    check (input_type in (
                      'number',       -- numeric input with optional unit
                      'text',         -- free text
                      'select',       -- single select from options
                      'multiselect',  -- multiple select from options
                      'boolean',      -- yes/no toggle
                      'date'          -- date picker
                    )),
  options         jsonb,                  -- for select/multiselect: ["Option A","Option B"]
  unit            text,                   -- display unit: "degrees", "mm", "in", "psi"
  unit_preference text,                   -- links to user unit pref for conversion:
                                          -- 'spring_rate', 'pressure', 'temp'
                                          -- null = no conversion (universal unit)

  -- Form behavior
  required        boolean not null default false,
  is_advanced     boolean not null default false,
  -- false = shown in basic view
  -- true  = shown only when user taps "+ Advanced specs"
  display_order   integer not null default 0,
  group_label     text,                   -- groups fields in the form: "Dimensions", "Performance"
  help_text       text,                   -- tooltip / explanatory text
  placeholder     text,                   -- input placeholder: "e.g. 264"

  created_at      timestamptz not null default now(),
  unique (part_type_id, spec_key)
);

comment on table  public.spec_templates is 'Dynamic form definitions per part type. One row = one field shown to the user.';
comment on column public.spec_templates.is_advanced is 'False = basic view. True = shown only under "+ Advanced specs" toggle.';
comment on column public.spec_templates.unit_preference is 'Links to users.spring_rate_unit / pressure_unit / temp_unit for display conversion.';
comment on column public.spec_templates.options is 'JSON array of options for select/multiselect fields: ["Option A","Option B"]';

create index if not exists spec_templates_part_type_id
  on public.spec_templates (part_type_id, display_order);

-- =============================================================================
-- STEP 3: job_specs table
-- Stores actual values entered by users.
-- One row = one spec value for one job.
-- =============================================================================

create table if not exists public.job_specs (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,

  spec_key    text not null,              -- matches spec_templates.spec_key
  spec_value  text not null,              -- always stored as text; parsed at display
  spec_unit   text,                       -- the unit this value is stored in (base unit)
  is_custom   boolean not null default false,
  -- false = entered via spec_templates form field
  -- true  = user-defined custom spec (free-form "Custom / Other" part type)

  created_at  timestamptz not null default now(),
  unique (job_id, spec_key)
);

comment on table  public.job_specs is 'User-entered spec values per job. Key-value pairs matched to spec_templates.';
comment on column public.job_specs.spec_value is 'Always stored as text. App parses to number/boolean/date at display time.';
comment on column public.job_specs.spec_unit is 'Base unit for this value (e.g. kg/mm for spring rate). Converted at display.';
comment on column public.job_specs.is_custom is 'True for user-defined specs on Custom/Other part types (free-form entry).';

create index if not exists job_specs_job_id
  on public.job_specs (job_id);

-- =============================================================================
-- STEP 4: Alter jobs — add new columns
-- part_types must exist before adding the FK.
-- =============================================================================

alter table public.jobs
  add column if not exists part_type_id        integer references public.part_types(id) on delete set null,
  add column if not exists is_donor_part        boolean not null default false,
  add column if not exists donor_make           text,
  add column if not exists donor_model          text,
  add column if not exists donor_year           integer,
  add column if not exists donor_part           text,
  add column if not exists fabrication_required boolean not null default false,
  add column if not exists fabrication_notes    text,
  add column if not exists modification_goals   text[],
  -- Values: 'power','handling','aesthetics','safety','reliability',
  --         'weight_reduction','sound','comfort','track','show','daily'
  add column if not exists is_custom_spec       boolean not null default false;

comment on column public.jobs.part_type_id is 'Links to part_types. Drives spec_templates lookup for dynamic form.';
comment on column public.jobs.is_donor_part is 'True when part came from another donor vehicle (e.g. 300ZX calipers on S14).';
comment on column public.jobs.donor_make is 'Donor vehicle make. e.g. "Nissan" for 300ZX calipers.';
comment on column public.jobs.donor_model is 'Donor vehicle model. e.g. "300ZX".';
comment on column public.jobs.donor_year is 'Donor vehicle year. e.g. 1994.';
comment on column public.jobs.donor_part is 'Description of what was taken from donor. e.g. "Front Brembo 4-pot calipers".';
comment on column public.jobs.fabrication_required is 'True when custom brackets, adapters, or fab work was required for fitment.';
comment on column public.jobs.fabrication_notes is 'Details of fabrication: "Custom 10mm bracket, M10x1.0 to M10x1.25 brake line adapter".';
comment on column public.jobs.modification_goals is 'Array of goals: power, handling, aesthetics, safety, reliability, etc.';
comment on column public.jobs.is_custom_spec is 'True when user used free-form Custom/Other spec entry.';

-- Index: donor part fitment queries (future community fitment feature)
create index if not exists jobs_donor_fitment
  on public.jobs (donor_make, donor_model, donor_year)
  where is_donor_part = true;

-- Index: part_type for spec template lookup
create index if not exists jobs_part_type_id
  on public.jobs (part_type_id)
  where part_type_id is not null;

-- =============================================================================
-- STEP 5: Alter car_reminders
-- Add source_job_id (links reminder to the job that created it)
-- Add 'safety' to category check (harness expiry, helmet cert expiry)
-- =============================================================================

alter table public.car_reminders
  add column if not exists source_job_id uuid references public.jobs(id) on delete set null;

comment on column public.car_reminders.source_job_id is
  'Job that auto-created this reminder (e.g. harness with expiry date). Tap reminder → opens job.';

-- Update category check constraint to include 'safety'
-- Must drop and recreate — cannot append to existing CHECK
alter table public.car_reminders
  drop constraint if exists car_reminders_category_check;

alter table public.car_reminders
  add constraint car_reminders_category_check
    check (category in (
      'registration','insurance','emissions','inspection',
      'warranty','lease','service','safety','other'
    ));

-- =============================================================================
-- STEP 6: Alter users — add new unit preferences
-- =============================================================================

alter table public.users
  add column if not exists spring_rate_unit text not null
    check (spring_rate_unit in ('kgmm','lbin'))
    default 'kgmm',
  add column if not exists pressure_unit text not null
    check (pressure_unit in ('psi','bar'))
    default 'psi',
  add column if not exists temp_unit text not null
    check (temp_unit in ('c','f'))
    default 'c';

comment on column public.users.spring_rate_unit is 'Display pref for spring rates. kgmm=kg/mm (default), lbin=lb/in. Stored in kg/mm.';
comment on column public.users.pressure_unit is 'Display pref for boost/pressure. psi (default) or bar. Stored in psi.';
comment on column public.users.temp_unit is 'Display pref for temperature. c=Celsius (default), f=Fahrenheit. Stored in °C.';

-- =============================================================================
-- STEP 7: Replace jobs_handle_removal trigger
-- Updated to: copy new job columns + copy job_specs to new Parts Bin entry
-- =============================================================================

create or replace function public.jobs_handle_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_job_id uuid;
begin
  -- Only fires: status changes installed → removed AND user kept the part
  if new.status = 'removed'
    and old.status = 'installed'
    and new.still_owned = true then

    -- Create new Parts Bin entry inheriting ALL part details
    insert into public.jobs (
      car_id, session_id, type, category, title, status,
      brand, part_number, cost, cost_currency, cost_notes,
      notes, part_type_id, is_donor_part, donor_make, donor_model,
      donor_year, donor_part, fabrication_required, fabrication_notes,
      modification_goals, is_custom_spec
    ) values (
      new.car_id,
      null,           -- No session — sitting in the garage
      new.type,
      new.category,
      new.title,
      'purchased',    -- Owned, available for reinstall
      new.brand,
      new.part_number,
      new.cost,
      new.cost_currency,
      new.cost_notes,
      'Previously installed. Removed ' ||
        coalesce(new.date_removed::text, 'recently') ||
        '. Available for reinstall.',
      new.part_type_id,
      new.is_donor_part,
      new.donor_make,
      new.donor_model,
      new.donor_year,
      new.donor_part,
      false,          -- fabrication_required reset — may differ on reinstall
      null,           -- fabrication_notes reset
      new.modification_goals,
      new.is_custom_spec
    )
    returning id into v_new_job_id;

    -- Copy all job_specs to the new Parts Bin entry
    -- Specs (dimensions, settings, etc.) belong to the part, not the installation
    insert into public.job_specs (job_id, spec_key, spec_value, spec_unit, is_custom)
    select v_new_job_id, spec_key, spec_value, spec_unit, is_custom
    from public.job_specs
    where job_id = new.id;

  end if;

  return new;
end;
$$;

-- Drop and recreate the trigger (function is replaced above)
drop trigger if exists jobs_removal_to_parts_bin on public.jobs;
create trigger jobs_removal_to_parts_bin
  after update of status on public.jobs
  for each row execute procedure public.jobs_handle_removal();

-- =============================================================================
-- STEP 8: Replace public_build_sheet view
-- Add non-sensitive new columns: donor info, modification_goals, fabrication flag
-- These add meaningful context for public profiles without exposing private data
-- =============================================================================

-- Drop first — CREATE OR REPLACE cannot change column positions
drop view if exists public.public_build_sheet;
create view public.public_build_sheet as
select
  j.id,
  j.car_id,
  j.type,
  j.category,
  j.title,
  j.brand,
  j.part_number,
  j.status,
  j.date_installed,
  j.date_removed,
  j.products_used,
  j.notes,
  -- Part type context
  j.part_type_id,
  pt.name          as part_type_name,
  -- Donor / fitment context (interesting for public profiles)
  j.is_donor_part,
  j.donor_make,
  j.donor_model,
  j.donor_year,
  j.donor_part,
  j.fabrication_required,
  -- fabrication_notes excluded — too detailed/personal
  j.modification_goals,
  j.is_custom_spec,
  j.created_at,
  -- Car context
  c.user_id,
  c.year           as car_year,
  c.make           as car_make,
  c.model          as car_model,
  c.nickname       as car_nickname,
  c.is_public      as car_is_public
  -- Intentionally excluded:
  -- j.cost, j.cost_currency, j.cost_notes (financial — always private)
  -- j.fabrication_notes (too detailed)
from public.jobs j
left join public.part_types pt on pt.id = j.part_type_id
join public.sessions s on s.id = j.session_id
join public.cars c on c.id = j.car_id
where
  j.status = 'installed'
  and j.type = 'modification'
  and c.is_public = true
  and c.deleted_at is null;

comment on view public.public_build_sheet is
  'Public Build Sheet. Installed mods for public cars. Cost and fabrication notes excluded.';

grant select on public.public_build_sheet to anon, authenticated;

-- =============================================================================
-- STEP 9: RLS for new tables
-- =============================================================================

-- part_types and spec_templates: reference data, public read only
alter table public.part_types enable row level security;
alter table public.spec_templates enable row level security;

grant select on public.part_types     to anon, authenticated;
grant select on public.spec_templates to anon, authenticated;

-- job_specs: owner full access + public read for installed mods on public cars
alter table public.job_specs enable row level security;

create policy "job_specs_all_owner"
  on public.job_specs for all
  using (
    exists (
      select 1 from public.jobs j
      join public.cars c on c.id = j.car_id
      where j.id = job_specs.job_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      join public.cars c on c.id = j.car_id
      where j.id = job_specs.job_id
        and c.user_id = auth.uid()
    )
  );

-- Public can read specs of installed mods on public cars
-- Powers the full spec detail on /builds/:username
create policy "job_specs_select_public"
  on public.job_specs for select
  using (
    exists (
      select 1 from public.jobs j
      join public.cars c on c.id = j.car_id
      where j.id = job_specs.job_id
        and j.status = 'installed'
        and j.type = 'modification'
        and c.is_public = true
        and c.deleted_at is null
    )
  );

-- =============================================================================
-- STEP 10: Audit trigger for job_specs
-- Spec changes (tuning adjustments, corrected values) should be audited
-- =============================================================================

create trigger job_specs_audit
  after update or delete on public.job_specs
  for each row execute procedure public.write_audit_log();

-- =============================================================================
-- STEP 11: SEED DATA — part_types
-- =============================================================================

insert into public.part_types (category, name, display_order) values

-- WHEELS & TIRES
('Wheels & Tires', 'Wheels',                    1),
('Wheels & Tires', 'Tires — Metric',             2),
('Wheels & Tires', 'Tires — Truck/Standard',     3),
('Wheels & Tires', 'Wheel Spacers / Adapters',   4),

-- SUSPENSION
('Suspension', 'Coilovers',              1),
('Suspension', 'Lowering Springs',       2),
('Suspension', 'Air Suspension / Bags',  3),
('Suspension', 'Sway Bars',              4),
('Suspension', 'Control Arms',           5),
('Suspension', 'Bushings',               6),
('Suspension', 'Strut Tower Brace',      7),
('Suspension', 'Alignment',              8),

-- BRAKES
('Brakes', 'Brake Pads',          1),
('Brakes', 'Rotors',              2),
('Brakes', 'Big Brake Kit',       3),
('Brakes', 'Brake Lines',         4),
('Brakes', 'Brake Fluid',         5),
('Brakes', 'Brake Calipers',      6),
('Brakes', 'Master Cylinder',     7),

-- ENGINE
('Engine', 'Cold Air Intake / Short Ram',  1),
('Engine', 'Intake Manifold',              2),
('Engine', 'Throttle Body',                3),
('Engine', 'Camshafts',                    4),
('Engine', 'Pistons',                      5),
('Engine', 'Connecting Rods',              6),
('Engine', 'Valves / Valve Springs',       7),
('Engine', 'Fuel Injectors',               8),
('Engine', 'Fuel Pump',                    9),
('Engine', 'Engine Management / ECU',      10),
('Engine', 'Head Work / Porting',          11),
('Engine', 'Engine Rebuild',               12),
('Engine', 'Oil Catch Can',                13),

-- FORCED INDUCTION
('Forced Induction', 'Turbocharger',                 1),
('Forced Induction', 'Supercharger',                 2),
('Forced Induction', 'Intercooler',                  3),
('Forced Induction', 'Blow-off Valve / Bypass Valve',4),
('Forced Induction', 'Wastegate',                    5),
('Forced Induction', 'Boost Controller',             6),
('Forced Induction', 'Charge Piping',                7),

-- EXHAUST
('Exhaust', 'Headers / Exhaust Manifold', 1),
('Exhaust', 'Downpipe / Frontpipe',       2),
('Exhaust', 'Catback System',             3),
('Exhaust', 'Mid-pipe / Test Pipe',       4),
('Exhaust', 'Catalytic Converter',        5),
('Exhaust', 'Exhaust Tips',               6),

-- DRIVETRAIN
('Drivetrain', 'Clutch',            1),
('Drivetrain', 'Flywheel',          2),
('Drivetrain', 'Differential',      3),
('Drivetrain', 'Driveshaft',        4),
('Drivetrain', 'Axles / Half-shafts',5),
('Drivetrain', 'Transmission',      6),
('Drivetrain', 'Short Shifter',     7),
('Drivetrain', 'Shifter Bushings',  8),

-- COOLING
('Cooling', 'Radiator',                1),
('Cooling', 'Oil Cooler',              2),
('Cooling', 'Transmission Cooler',     3),
('Cooling', 'Thermostat',              4),
('Cooling', 'Water Pump',              5),
('Cooling', 'Cooling Fan',             6),
('Cooling', 'Coolant Overflow Tank',   7),

-- ELECTRICAL
('Electrical', 'Battery',           1),
('Electrical', 'Alternator',        2),
('Electrical', 'Starter Motor',     3),
('Electrical', 'Wiring Harness',    4),

-- SAFETY
('Safety', 'Harness / Seatbelt',       1),
('Safety', 'Roll Bar / Roll Cage',     2),
('Safety', 'Helmet',                   3),
('Safety', 'Fire Suppression System',  4),
('Safety', 'Window Net',               5),

-- EXTERIOR / AERO
('Exterior', 'Front Bumper / Lip',     1),
('Exterior', 'Rear Bumper / Diffuser', 2),
('Exterior', 'Side Skirts',            3),
('Exterior', 'Fenders / Widebody',     4),
('Exterior', 'Hood',                   5),
('Exterior', 'Wing / Spoiler',         6),
('Exterior', 'Mirror Caps',            7),

-- PAINT & WRAP
('Paint & Wrap', 'Full Paint',              1),
('Paint & Wrap', 'Vinyl Wrap',              2),
('Paint & Wrap', 'Paint Protection Film',   3),
('Paint & Wrap', 'Ceramic Coating',         4),
('Paint & Wrap', 'Partial Respray',         5),

-- INTERIOR
('Interior', 'Seats',           1),
('Interior', 'Steering Wheel',  2),
('Interior', 'Shift Knob',      3),
('Interior', 'Gauges / Pods',   4),
('Interior', 'Dash Kit',        5),
('Interior', 'Door Panels',     6),
('Interior', 'Window Tint',     7),
('Interior', 'Sound Deadening', 8),

-- AUDIO
('Audio', 'Head Unit',   1),
('Audio', 'Speakers',    2),
('Audio', 'Amplifier',   3),
('Audio', 'Subwoofer',   4),

-- LIGHTING
('Lighting', 'Headlights',          1),
('Lighting', 'Tail Lights',         2),
('Lighting', 'Fog Lights',          3),
('Lighting', 'Interior Lighting',   4),
('Lighting', 'Underglow',           5),

-- FUEL SYSTEM
('Fuel System', 'Fuel Injectors',           1),
('Fuel System', 'Fuel Pump',                2),
('Fuel System', 'Surge Tank',               3),
('Fuel System', 'Fuel Pressure Regulator',  4),
('Fuel System', 'Fuel Lines',               5),

-- OTHER
('Other', 'Custom Fabrication', 1),
('Other', 'Other',              2)

on conflict (category, name) do nothing;

-- =============================================================================
-- STEP 12: SEED DATA — spec_templates
-- =============================================================================

do $$
declare
  pt_id integer;
begin

-- ============================================================
-- WHEELS
-- ============================================================
select id into pt_id from public.part_types where category = 'Wheels & Tires' and name = 'Wheels';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'diameter',     'Diameter',         'number','in',  true, false,1,'Dimensions','Wheel diameter in inches','e.g. 17'),
  (pt_id,'width',        'Width',            'number','in',  true, false,2,'Dimensions','Wheel width in inches','e.g. 7.5'),
  (pt_id,'offset',       'Offset',           'number','mm',  true, false,3,'Dimensions','Positive = wheel pushed out. Negative = tucked in','e.g. +45'),
  (pt_id,'bolt_pattern', 'Bolt Pattern',     'text',  null,  true, false,4,'Dimensions','Number of bolts × bolt circle diameter','e.g. 5x114.3'),
  (pt_id,'quantity',     'Quantity',         'number',null,  true, false,5,'Dimensions',null,'4'),
  (pt_id,'center_bore',  'Center Bore',      'number','mm',  false,true, 6,'Dimensions','Hub bore diameter','e.g. 73.1'),
  (pt_id,'weight',       'Weight per Wheel', 'number','lbs', false,true, 7,'Dimensions','Weight of one wheel','e.g. 15.2'),
  (pt_id,'finish',       'Finish / Color',   'text',  null,  false,false,8,'Details',null,'e.g. Machined Silver, Gloss Black')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- TIRES — METRIC (cars, JDM, euro)
-- ============================================================
select id into pt_id from public.part_types where category = 'Wheels & Tires' and name = 'Tires — Metric';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'width',         'Width',         'number','mm',  true, false,1,'Size','Tire width in millimeters','e.g. 235'),
  (pt_id,'aspect_ratio',  'Aspect Ratio',  'number',null,  true, false,2,'Size','Sidewall height as % of width','e.g. 40'),
  (pt_id,'rim_diameter',  'Rim Diameter',  'number','in',  true, false,3,'Size','Rim diameter in inches','e.g. 17'),
  (pt_id,'quantity',      'Quantity',      'number',null,  true, false,4,'Size',null,'4'),
  (pt_id,'compound',      'Compound',      'select','"Summer","All-Season","Winter","Track","Drag","Mud Terrain","All-Terrain"',
                                                           false,false,5,'Details',null,null),
  (pt_id,'speed_rating',  'Speed Rating',  'text',  null,  false,true, 6,'Details','Letter code on sidewall (W, Y, Z, etc.)','e.g. W'),
  (pt_id,'load_index',    'Load Index',    'number',null,  false,true, 7,'Details','Numeric load index from sidewall','e.g. 95'),
  (pt_id,'tread_depth',   'Tread Depth',   'number','mm',  false,true, 8,'Details','Remaining tread at install','e.g. 8')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- TIRES — TRUCK / STANDARD (off-road, trucks, lifted)
-- ============================================================
select id into pt_id from public.part_types where category = 'Wheels & Tires' and name = 'Tires — Truck/Standard';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'overall_diameter','Overall Diameter','number','in', true, false,1,'Size','Total tire height in inches','e.g. 35'),
  (pt_id,'width',           'Width',           'number','in', true, false,2,'Size','Tire width in inches','e.g. 12.50'),
  (pt_id,'rim_diameter',    'Rim Diameter',    'number','in', true, false,3,'Size','e.g. 17'),
  (pt_id,'quantity',        'Quantity',        'number',null,  true, false,4,'Size',null,'4'),
  (pt_id,'terrain',         'Terrain Type',    'select','"Highway","All-Terrain (A/T)","Mud Terrain (M/T)","Sand","Rock Crawler"',
                                                              false,false,5,'Details',null,null),
  (pt_id,'load_range',      'Load Range',      'select','"C (6-ply)","D (8-ply)","E (10-ply)","F (12-ply)"',
                                                              false,true, 6,'Details','Load range / ply rating',null),
  (pt_id,'rim_protection',  'Rim Protection',  'boolean',null, false,true, 7,'Details','Raised rim protector on sidewall',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- WHEEL SPACERS
-- ============================================================
select id into pt_id from public.part_types where category = 'Wheels & Tires' and name = 'Wheel Spacers / Adapters';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'thickness',    'Thickness',     'number','mm',  true, false,1,'Dimensions',null,'e.g. 15'),
  (pt_id,'bolt_pattern', 'Bolt Pattern',  'text',  null,  true, false,2,'Dimensions',null,'e.g. 5x114.3'),
  (pt_id,'hub_bore',     'Hub Bore',      'number','mm',  false,true, 3,'Dimensions','Center bore of spacer','e.g. 73.1'),
  (pt_id,'is_adapter',   'Bolt Pattern Adapter', 'boolean',null,false,false,4,'Details','Changes bolt pattern (not just spacing)',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- COILOVERS
-- ============================================================
select id into pt_id from public.part_types where category = 'Suspension' and name = 'Coilovers';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'front_drop',       'Front Drop',          'number','mm',  null,           false,false,1,'Height','Drop from stock ride height','e.g. -35'),
  (pt_id,'rear_drop',        'Rear Drop',           'number','mm',  null,           false,false,2,'Height','Drop from stock ride height','e.g. -30'),
  (pt_id,'spring_rate_f',    'Front Spring Rate',   'number','kg/mm','spring_rate', false,false,3,'Springs','Stored in kg/mm. Converted by your unit preference.','e.g. 8'),
  (pt_id,'spring_rate_r',    'Rear Spring Rate',    'number','kg/mm','spring_rate', false,false,4,'Springs',null,'e.g. 6'),
  (pt_id,'damping_type',     'Damping Type',        'select','"1-Way","2-Way","3-Way","4-Way"',
                                                                    null,           false,false,5,'Damping','Ways = how many separate adjustments available',null),
  (pt_id,'compression_clicks','Compression Clicks', 'number',null,  null,           false,true, 6,'Damping','Current compression setting',null),
  (pt_id,'rebound_clicks',   'Rebound Clicks',      'number',null,  null,           false,true, 7,'Damping','Current rebound setting',null),
  (pt_id,'hsc_clicks',       'Hi-Speed Compression','number',null,  null,           false,true, 8,'Damping','3-Way+ only: high-speed compression clicks',null),
  (pt_id,'camber_plates',    'Camber Plates',       'boolean',null, null,           false,true, 9,'Features','Includes adjustable camber plates',null),
  (pt_id,'pillow_ball',      'Pillow Ball Top Mount','boolean',null,null,           false,true,10,'Features','Pillow ball (harder, more feedback) vs rubber top mount',null),
  (pt_id,'inverted',         'Inverted Strut',      'boolean',null, null,           false,true,11,'Features','Inverted / upside-down strut design',null),
  (pt_id,'swift_springs',    'Swift Springs',       'boolean',null, null,           false,true,12,'Features','Aftermarket Swift springs installed',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- AIR SUSPENSION / BAGS
-- ============================================================
select id into pt_id from public.part_types where category = 'Suspension' and name = 'Air Suspension / Bags';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'management',   'Management System','select','"Manual","Single Corner","4-Corner Analog","Digital (Air Lift 3P)","Digital (Accuair)","Digital (Viair)","Other"',
                                                         false,false,1,'System',null,null),
  (pt_id,'tank_size',    'Tank Size',        'number','gal',false,false,2,'System','Air tank capacity in gallons','e.g. 2.5'),
  (pt_id,'compressor',   'Compressor Setup', 'select','"Single","Dual","Dual with Manifold"',
                                                         false,false,3,'System',null,null),
  (pt_id,'psi_range',    'PSI Range',        'text',  null, false,true, 4,'System','Min–Max operating pressure','e.g. 0–200'),
  (pt_id,'drop_aired',   'Height Aired Out', 'number','mm', false,false,5,'Height','Drop from stock at full airing out',null),
  (pt_id,'drop_full',    'Height Full Press','number','mm', false,false,6,'Height','Drop from stock at full pressure',null),
  (pt_id,'paddle_switch','Paddle/Switch',    'boolean',null,false,true, 7,'Controls',null,null),
  (pt_id,'app_control',  'App Control',      'boolean',null,false,true, 8,'Controls','Phone app control (Accuair etc.)',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- LOWERING SPRINGS
-- ============================================================
select id into pt_id from public.part_types where category = 'Suspension' and name = 'Lowering Springs';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'front_drop',    'Front Drop',        'number','mm',   null,          false,false,1,'Height',null,'e.g. -35'),
  (pt_id,'rear_drop',     'Rear Drop',         'number','mm',   null,          false,false,2,'Height',null,'e.g. -30'),
  (pt_id,'spring_rate_f', 'Front Spring Rate', 'number','kg/mm','spring_rate', false,true, 3,'Springs',null,'e.g. 6'),
  (pt_id,'spring_rate_r', 'Rear Spring Rate',  'number','kg/mm','spring_rate', false,true, 4,'Springs',null,'e.g. 4')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- SWAY BARS
-- ============================================================
select id into pt_id from public.part_types where category = 'Suspension' and name = 'Sway Bars';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'front_diameter','Front Diameter', 'number','mm',  false,false,1,'Dimensions',null,'e.g. 25'),
  (pt_id,'rear_diameter', 'Rear Diameter',  'number','mm',  false,false,2,'Dimensions',null,'e.g. 22'),
  (pt_id,'adjustable',    'Adjustable',     'boolean',null, false,false,3,'Details','Multiple adjustment holes',null),
  (pt_id,'end_links',     'End Link Type',  'select','"OEM Rubber","Polyurethane","Pillow Ball / Spherical"',
                                                            false,true, 4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- CONTROL ARMS
-- ============================================================
select id into pt_id from public.part_types where category = 'Suspension' and name = 'Control Arms';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',    'Position',      'select','"Upper Front","Lower Front","Upper Rear","Lower Rear","Both Rears","Full Set"',
                                                    true, false,1,'Details',null,null),
  (pt_id,'material',    'Material',      'select','"OEM Steel","Aftermarket Steel","Aluminum","Chromoly"',
                                                    false,false,2,'Details',null,null),
  (pt_id,'adjustable',  'Adjustable',    'boolean',null, false,false,3,'Details','Adjustable for alignment correction',null),
  (pt_id,'bushing_type','Bushing Type',  'select','"OEM Rubber","Polyurethane","Pillow Ball / Spherical"',
                                                    false,true, 4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BRAKE PADS
-- ============================================================
select id into pt_id from public.part_types where category = 'Brakes' and name = 'Brake Pads';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',    'Position',         'select','"Front","Rear","Front & Rear"',
                                                       true, false,1,'Details',null,null),
  (pt_id,'compound',    'Compound',         'select','"Street","Street Performance","Track Day","Race","Drag"',
                                                       false,false,2,'Details',null,null),
  (pt_id,'temp_min',    'Min Temp',         'number','°C','temp',false,true,3,'Temperature','Minimum operating temperature',null),
  (pt_id,'temp_max',    'Max Temp',         'number','°C','temp',false,true,4,'Temperature','Maximum operating temperature','e.g. 700'),
  (pt_id,'bedding_req', 'Bedding Required', 'boolean',null,null, false,true,5,'Details','Requires bedding procedure after install',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- ROTORS
-- ============================================================
select id into pt_id from public.part_types where category = 'Brakes' and name = 'Rotors';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',    'Position',   'select', '"Front","Rear","Front & Rear"',
                                                  true, false,1,'Details',null,null),
  (pt_id,'diameter',    'Diameter',   'number','mm',  false,false,2,'Dimensions',null,'e.g. 330'),
  (pt_id,'thickness',   'Thickness',  'number','mm',  false,true, 3,'Dimensions','New rotor thickness','e.g. 28'),
  (pt_id,'type',        'Type',       'select', '"Solid","Vented","Slotted","Drilled","Slotted & Drilled"',
                                                  false,false,4,'Details',null,null),
  (pt_id,'material',    'Material',   'select', '"Cast Iron","Carbon Ceramic"',
                                                  false,true, 5,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BRAKE CALIPERS (including OEM donor swaps)
-- ============================================================
select id into pt_id from public.part_types where category = 'Brakes' and name = 'Brake Calipers';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',     'Position',      'select','"Front","Rear","Front & Rear"',
                                                     true, false,1,'Details',null,null),
  (pt_id,'piston_count', 'Piston Count',  'number',null,   false,false,2,'Details','Number of pistons per caliper','e.g. 4'),
  (pt_id,'color',        'Color',         'text',  null,   false,false,3,'Details',null,'e.g. Red, Black, Gold'),
  (pt_id,'min_rotor',    'Min Rotor Dia', 'number','mm',   false,true, 4,'Fitment','Minimum rotor diameter required','e.g. 330'),
  (pt_id,'min_wheel',    'Min Wheel Size','number','in',   false,true, 5,'Fitment','Minimum wheel diameter to clear caliper','e.g. 17'),
  (pt_id,'bracket_req',  'Bracket Required','boolean',null,false,true, 6,'Fitment','Custom bracket required for fitment',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BIG BRAKE KIT
-- ============================================================
select id into pt_id from public.part_types where category = 'Brakes' and name = 'Big Brake Kit';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'rotor_diameter','Rotor Diameter',    'number','mm', false,false,1,'Dimensions',null,'e.g. 355'),
  (pt_id,'piston_count',  'Caliper Pistons',   'number',null, false,false,2,'Details','Pistons per caliper','e.g. 6'),
  (pt_id,'caliper_color', 'Caliper Color',     'text',  null, false,false,3,'Details',null,'e.g. Red'),
  (pt_id,'min_wheel',     'Min Wheel Size',    'number','in', false,true, 4,'Fitment','Minimum wheel size to clear','e.g. 18'),
  (pt_id,'spacer_req',    'Spacer Required',   'boolean',null,false,true, 5,'Fitment','Requires wheel spacer for clearance',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BRAKE FLUID
-- ============================================================
select id into pt_id from public.part_types where category = 'Brakes' and name = 'Brake Fluid';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'dot_rating', 'DOT Rating',       'select','"DOT 3","DOT 4","DOT 5","DOT 5.1"',
                                                      false,false,1,'Details',null,null),
  (pt_id,'dry_boil',   'Dry Boiling Point','number','°C','temp',false,true,2,'Performance','Boiling point of fresh fluid',null),
  (pt_id,'wet_boil',   'Wet Boiling Point','number','°C','temp',false,true,3,'Performance','Boiling point after moisture absorption',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- CAMSHAFTS
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Camshafts';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',        'Cam Position',     'select','"Intake Only","Exhaust Only","Both (Intake & Exhaust)"',
                                                           true, false,1,'Details',null,null),
  (pt_id,'intake_duration', 'Intake Duration',  'number','°',    false,false,2,'Specs','Duration at 0.050" lift in degrees','e.g. 264'),
  (pt_id,'exhaust_duration','Exhaust Duration', 'number','°',    false,false,3,'Specs',null,'e.g. 264'),
  (pt_id,'intake_lift',     'Intake Lift',      'number','mm',   false,false,4,'Specs','Maximum valve lift','e.g. 10.8'),
  (pt_id,'exhaust_lift',    'Exhaust Lift',     'number','mm',   false,false,5,'Specs',null,'e.g. 10.8'),
  (pt_id,'lsa',             'LSA',              'number','°',    false,false,6,'Specs','Lobe Separation Angle','e.g. 110'),
  (pt_id,'grind_number',    'Grind Number',     'text',  null,   false,true, 7,'Details','Manufacturer spec / part number for this grind','e.g. HKS 264-10.8'),
  (pt_id,'cam_gears_req',   'Cam Gears Required','boolean',null, false,true, 8,'Details','Adjustable cam gears required or included',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- TURBOCHARGER
-- ============================================================
select id into pt_id from public.part_types where category = 'Forced Induction' and name = 'Turbocharger';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'frame_size',    'Frame / Model',      'text',  null,  null,      false,false,1,'Identity','Full model name or frame code','e.g. GT2871R, GTX3071R'),
  (pt_id,'comp_ar',       'Compressor A/R',     'text',  null,  null,      false,false,2,'Specs','Compressor housing A/R ratio','e.g. 0.60'),
  (pt_id,'turbine_ar',    'Turbine A/R',        'text',  null,  null,      false,false,3,'Specs','Turbine housing A/R ratio','e.g. 0.86'),
  (pt_id,'comp_wheel',    'Compressor Wheel',   'number','mm',  null,      false,true, 4,'Specs','Compressor wheel diameter','e.g. 56'),
  (pt_id,'turbine_wheel', 'Turbine Wheel',      'number','mm',  null,      false,true, 5,'Specs','Turbine wheel diameter','e.g. 62'),
  (pt_id,'target_boost',  'Target Boost',       'number','psi', 'pressure',false,false,6,'Setup','Boost pressure target','e.g. 14'),
  (pt_id,'water_cooled',  'Water Cooled',       'boolean',null, null,      false,true, 7,'Features',null,null),
  (pt_id,'ball_bearing',  'Ball Bearing CHRA',  'boolean',null, null,      false,true, 8,'Features','Ball bearing vs journal bearing center',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- INTERCOOLER
-- ============================================================
select id into pt_id from public.part_types where category = 'Forced Induction' and name = 'Intercooler';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'ic_type',   'Type',         'select','"Front Mount (FMIC)","Top Mount (TMIC)","Side Mount","Air-to-Water"',
                                                 false,false,1,'Details',null,null),
  (pt_id,'core_w',    'Core Width',   'number','mm', false,true,2,'Dimensions',null,'e.g. 600'),
  (pt_id,'core_h',    'Core Height',  'number','mm', false,true,3,'Dimensions',null,'e.g. 300'),
  (pt_id,'core_thk',  'Core Thickness','number','mm',false,true,4,'Dimensions',null,'e.g. 76'),
  (pt_id,'inlet_dia', 'Inlet/Outlet', 'number','mm', false,true,5,'Dimensions','Inlet & outlet pipe diameter','e.g. 63')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- WASTEGATE
-- ============================================================
select id into pt_id from public.part_types where category = 'Forced Induction' and name = 'Wastegate';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'wg_type',      'Type',            'select','"Internal","External"',
                                                       false,false,1,'Details',null,null),
  (pt_id,'diameter',     'Diameter',        'number','mm',null,   false,true,2,'Dimensions',null,'e.g. 38'),
  (pt_id,'spring_press', 'Spring Pressure', 'number','psi','pressure',false,true,3,'Details','Base spring pressure','e.g. 7')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BLOW-OFF / BYPASS VALVE
-- ============================================================
select id into pt_id from public.part_types where category = 'Forced Induction' and name = 'Blow-off Valve / Bypass Valve';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'bov_type',  'Type',         'select','"Vent to Atmosphere","Recirculating","Dual Port"',
                                                 false,false,1,'Details',null,null),
  (pt_id,'inlet_dia', 'Inlet Size',   'number','mm', false,true,2,'Dimensions','Inlet pipe diameter','e.g. 50')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HEADERS / EXHAUST MANIFOLD
-- ============================================================
select id into pt_id from public.part_types where category = 'Exhaust' and name = 'Headers / Exhaust Manifold';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'primary_dia',  'Primary Diameter', 'number','mm',  false,true, 1,'Dimensions',null,'e.g. 44'),
  (pt_id,'collector',    'Collector Size',   'number','mm',  false,true, 2,'Dimensions',null,'e.g. 63'),
  (pt_id,'material',     'Material',         'select','"Mild Steel","Stainless Steel","Inconel","Titanium"',
                                                               false,false,3,'Details',null,null),
  (pt_id,'equal_length', 'Equal Length',     'boolean',null,  false,true, 4,'Details',null,null),
  (pt_id,'ceramic_coat', 'Ceramic Coated',   'boolean',null,  false,true, 5,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- CATBACK SYSTEM
-- ============================================================
select id into pt_id from public.part_types where category = 'Exhaust' and name = 'Catback System';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'pipe_dia',   'Pipe Diameter', 'number','mm',  false,true, 1,'Dimensions',null,'e.g. 76'),
  (pt_id,'tip_dia',    'Tip Diameter',  'number','mm',  false,true, 2,'Dimensions',null,'e.g. 114'),
  (pt_id,'tip_style',  'Tip Style',     'select','"Single","Dual","Quad","Burnt","Rolled","Slant Cut"',
                                                          false,false,3,'Details',null,null),
  (pt_id,'material',   'Material',      'select','"Mild Steel","Stainless Steel","Titanium"',
                                                          false,false,4,'Details',null,null),
  (pt_id,'sound',      'Sound Level',   'select','"Quiet","Moderate","Loud","Race / Straight Pipe"',
                                                          false,false,5,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- DOWNPIPE / FRONTPIPE
-- ============================================================
select id into pt_id from public.part_types where category = 'Exhaust' and name = 'Downpipe / Frontpipe';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'diameter',  'Pipe Diameter', 'number','mm',  false,true, 1,'Dimensions',null,'e.g. 76'),
  (pt_id,'cat_type',  'Catalytic Converter', 'select','"OEM Cat","High Flow Cat (200 cell)","High Flow Cat (400 cell)","Catless"',
                                                         false,false,2,'Details',null,null),
  (pt_id,'material',  'Material',      'select','"Mild Steel","Stainless Steel","Titanium"',
                                                         false,true, 3,'Details',null,null),
  (pt_id,'flex_sect', 'Flex Section',  'boolean',null,  false,true, 4,'Details','Flexible section to reduce vibration/cracking',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- CLUTCH
-- ============================================================
select id into pt_id from public.part_types where category = 'Drivetrain' and name = 'Clutch';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'diameter',     'Disc Diameter',  'number','mm',  false,true, 1,'Dimensions',null,'e.g. 240'),
  (pt_id,'stage',        'Stage',          'select','"Stage 1","Stage 2","Stage 3","Stage 4","Stage 5"',
                                                            false,false,2,'Details',null,null),
  (pt_id,'disc_material','Disc Material',  'select','"Organic","Ceramic","Carbon","Kevlar","Carbon-Kevlar"',
                                                            false,false,3,'Details',null,null),
  (pt_id,'hub_type',     'Hub Type',       'select','"Sprung Hub (street)","Solid Hub (race)"',
                                                            false,true, 4,'Details','Sprung = dampening springs in hub, smoother engagement',null),
  (pt_id,'twin_disc',    'Twin Disc',      'boolean',null,  false,true, 5,'Details',null,null),
  (pt_id,'street_ok',    'Street Driveable','boolean',null, false,false,6,'Details','Can be driven comfortably on the street',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FLYWHEEL
-- ============================================================
select id into pt_id from public.part_types where category = 'Drivetrain' and name = 'Flywheel';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'weight',    'Weight',    'number','lbs', false,false,1,'Details','Flywheel weight in lbs','e.g. 12'),
  (pt_id,'material',  'Material',  'select','"OEM Steel","Lightweight Steel","Aluminum","Chromoly"',
                                              false,false,2,'Details',null,null),
  (pt_id,'fw_type',   'Type',      'select','"Single Mass","Dual Mass"',
                                              false,true, 3,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- DIFFERENTIAL
-- ============================================================
select id into pt_id from public.part_types where category = 'Drivetrain' and name = 'Differential';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'position',   'Position',     'select','"Front","Rear","Center","Transfer Case"',
                                                  false,false,1,'Details',null,null),
  (pt_id,'diff_type',  'Diff Type',    'select','"Open","Viscous LSD","Clutch-Type LSD","Torsen / Helical","Spool","Electronic LSD"',
                                                  false,false,2,'Details',null,null),
  (pt_id,'final_drive','Final Drive Ratio','text',null,  false,true, 3,'Details','Ring and pinion ratio','e.g. 4.08'),
  (pt_id,'ramp_angle', 'Ramp Angles',  'text',  null,   false,true, 4,'Details','For clutch-type LSD: accel/decel ramp angles','e.g. 45/60')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- RADIATOR
-- ============================================================
select id into pt_id from public.part_types where category = 'Cooling' and name = 'Radiator';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'core_w',    'Core Width',   'number','mm',  false,true, 1,'Dimensions',null,'e.g. 600'),
  (pt_id,'core_h',    'Core Height',  'number','mm',  false,true, 2,'Dimensions',null,'e.g. 400'),
  (pt_id,'rows',      'Rows',         'number',null,  false,false,3,'Details','Number of core rows','e.g. 3'),
  (pt_id,'material',  'Material',     'select','"Aluminum","Copper-Brass"',
                                                       false,false,4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- OIL COOLER
-- ============================================================
select id into pt_id from public.part_types where category = 'Cooling' and name = 'Oil Cooler';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'rows',       'Rows',           'number',null,  null,     false,false,1,'Details','e.g. 16 row, 25 row','e.g. 19'),
  (pt_id,'thermostat', 'Thermostat',     'boolean',null, null,     false,true, 2,'Details','Thermostat sandwich plate included',null),
  (pt_id,'target_temp','Target Oil Temp','number','°C',  'temp',   false,true, 3,'Details','Target operating temperature',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- THERMOSTAT
-- ============================================================
select id into pt_id from public.part_types where category = 'Cooling' and name = 'Thermostat';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, unit_preference, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'open_temp','Opening Temp','number','°C','temp',false,false,1,'Details','Temperature at which thermostat opens','e.g. 76')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- BATTERY
-- ============================================================
select id into pt_id from public.part_types where category = 'Electrical' and name = 'Battery';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'cca',       'CCA',         'number',null,  false,false,1,'Specs','Cold Cranking Amps','e.g. 600'),
  (pt_id,'rc',        'Reserve Cap', 'number','min', false,true, 2,'Specs','Reserve Capacity in minutes','e.g. 100'),
  (pt_id,'group_size','Group Size',  'text',  null,  false,true, 3,'Details','Battery group / size code','e.g. 51R, 35'),
  (pt_id,'chemistry', 'Chemistry',   'select','"Lead Acid","AGM","Lithium / LiFePO4"',
                                               false,false,4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HARNESS / SEATBELT (Safety — auto-reminder on expiry)
-- ============================================================
select id into pt_id from public.part_types where category = 'Safety' and name = 'Harness / Seatbelt';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'points',     'Points',      'select','"3-Point OEM","4-Point","5-Point","6-Point"',
                                                 true, false,1,'Details',null,null),
  (pt_id,'sfi_rating', 'SFI Rating',  'text',  null,  false,false,2,'Certification',null,'e.g. SFI 16.1'),
  (pt_id,'fia_rating', 'FIA Rating',  'text',  null,  false,false,3,'Certification',null,'e.g. FIA 8853-2016'),
  (pt_id,'expiry_date','Expiry Date', 'date',  null,  false,false,4,'Certification',
    'Required for tech inspection. App will create a reminder automatically.',null),
  (pt_id,'color',      'Color',       'text',  null,  false,true, 5,'Details',null,'e.g. Black, Red')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- ROLL BAR / ROLL CAGE
-- ============================================================
select id into pt_id from public.part_types where category = 'Safety' and name = 'Roll Bar / Roll Cage';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'points',    'Points',      'select','"4-Point Bar","6-Point Bar","8-Point Cage","10-Point Cage","Full Cage"',
                                                true, false,1,'Details',null,null),
  (pt_id,'material',  'Material',    'select','"Mild Steel","DOM Steel","Chromoly (4130)"',
                                                false,false,2,'Details',null,null),
  (pt_id,'install',   'Installation','select','"Bolt-In","Weld-In"',
                                                false,false,3,'Details',null,null),
  (pt_id,'padded',    'Padded',      'boolean',null, false,false,4,'Details','SFI/FIA-spec padding installed',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HELMET (Safety — auto-reminder on cert expiry)
-- ============================================================
select id into pt_id from public.part_types where category = 'Safety' and name = 'Helmet';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'certification','Certification','select','"DOT","Snell SA2020","Snell SA2025","FIA 8860","FIA 8859"',
                                                    true, false,1,'Certification',null,null),
  (pt_id,'expiry_date',  'Expiry Date',  'date',  null,  false,false,2,'Certification',
    'Snell certs expire after 5 years. App will create a reminder automatically.',null),
  (pt_id,'helmet_size',  'Size',         'text',  null,  false,true, 3,'Details',null,'e.g. M, L, XL, 58cm'),
  (pt_id,'fia_hans',     'HANS Compatible','boolean',null,false,true,4,'Details','Required for FIA-rated events',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FIRE SUPPRESSION (Safety)
-- ============================================================
select id into pt_id from public.part_types where category = 'Safety' and name = 'Fire Suppression System';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'agent',      'Agent',          'select','"Novec 1230","Halon","CO2","Dry Chemical"',
                                                    false,false,1,'Details',null,null),
  (pt_id,'capacity',   'Capacity',       'number','lbs', false,false,2,'Details',null,'e.g. 2.25'),
  (pt_id,'automatic',  'Automatic',      'boolean',null, false,false,3,'Details','Auto-trigger + manual pull',null),
  (pt_id,'nozzle_count','Nozzle Count',  'number',null,  false,true, 4,'Details',null,'e.g. 3'),
  (pt_id,'inspect_date','Next Inspection','date', null,  false,false,5,'Certification',
    'System requires periodic inspection. App will create a reminder.',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- WING / SPOILER
-- ============================================================
select id into pt_id from public.part_types where category = 'Exterior' and name = 'Wing / Spoiler';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'material',    'Material',     'select','"FRP (Fiberglass)","Carbon Fiber","Polyurethane","ABS"',
                                                   false,false,1,'Details',null,null),
  (pt_id,'adjustable',  'Adjustable',   'boolean',null,  false,false,2,'Details','Multiple angle adjustment',null),
  (pt_id,'blade_count', 'Blade Count',  'number',null,   false,true, 3,'Details','Number of elements/blades','e.g. 1'),
  (pt_id,'mounting',    'Mounting',     'select','"Trunk","Roof","Hatch","Roof Scoop"',
                                                   false,true, 4,'Details',null,null),
  (pt_id,'painted',     'Painted',      'boolean',null,  false,false,5,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FENDERS / WIDEBODY
-- ============================================================
select id into pt_id from public.part_types where category = 'Exterior' and name = 'Fenders / Widebody';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'width_per_side','Width Added Per Side','number','mm', false,false,1,'Dimensions',null,'e.g. 50'),
  (pt_id,'material',      'Material',            'select','"FRP (Fiberglass)","Carbon Fiber","Polyurethane","Steel","Aluminum"',
                                                            false,false,2,'Details',null,null),
  (pt_id,'install_method','Install Method',      'select','"Bolt-On","Cut & Flare","Riveted"',
                                                            false,false,3,'Details',null,null),
  (pt_id,'painted',       'Painted',             'boolean',null, false,false,4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FULL PAINT
-- ============================================================
select id into pt_id from public.part_types where category = 'Paint & Wrap' and name = 'Full Paint';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'color_code',  'Color Code',   'text',  null,  false,false,1,'Details',null,'e.g. NH-578, 040, AY3'),
  (pt_id,'color_name',  'Color Name',   'text',  null,  false,false,2,'Details',null,'e.g. Nighthawk Black Pearl'),
  (pt_id,'finish',      'Finish',       'select','"Gloss","Satin","Matte","Metallic","Pearl","Candy","Chrome","Two-Tone"',
                                                   false,false,3,'Details',null,null),
  (pt_id,'prep',        'Prep Work',    'select','"Light Sand & Prep","Full Strip to Metal","Metal Work Required","OEM Over Existing"',
                                                   false,true, 4,'Details',null,null),
  (pt_id,'clear_coat',  'Clear Coat',   'boolean',null,  false,true, 5,'Details',null,null),
  (pt_id,'performed_by','Performed By', 'select','"Self","Shop"',
                                                   false,false,6,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- VINYL WRAP
-- ============================================================
select id into pt_id from public.part_types where category = 'Paint & Wrap' and name = 'Vinyl Wrap';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'color_name',  'Color / Name', 'text',  null,  false,false,1,'Details',null,'e.g. 3M 1080 Matte Black'),
  (pt_id,'finish',      'Finish',       'select','"Gloss","Satin","Matte","Brushed Metal","Carbon Fiber","Chrome","Color Shift"',
                                                   false,false,2,'Details',null,null),
  (pt_id,'coverage',    'Coverage',     'select','"Full Car","Roof Only","Hood Only","Partial","Accents Only"',
                                                   false,false,3,'Details',null,null),
  (pt_id,'performed_by','Performed By', 'select','"Self","Shop"',
                                                   false,false,4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- SEATS
-- ============================================================
select id into pt_id from public.part_types where category = 'Interior' and name = 'Seats';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'seat_type',   'Type',           'select','"Full Bucket","Reclining Bucket","OEM Replacement","Bench"',
                                                     false,false,1,'Details',null,null),
  (pt_id,'material',    'Material',       'select','"Fabric","Alcantara","Leather","Vinyl","Carbon Shell"',
                                                     false,false,2,'Details',null,null),
  (pt_id,'mount_type',  'Mount Type',     'select','"OEM Rails","Low Mount","Side Mount","Fixed"',
                                                     false,true, 3,'Details',null,null),
  (pt_id,'hans_compat', 'HANS Compatible','boolean',null,  false,true, 4,'Safety',null,null),
  (pt_id,'harness_bar', 'Harness Openings','boolean',null, false,true, 5,'Safety','Openings for 5/6-point harness',null),
  (pt_id,'quantity',    'Quantity',        'number',null,  false,false,6,'Details',null,'1 or 2')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- WINDOW TINT
-- ============================================================
select id into pt_id from public.part_types where category = 'Interior' and name = 'Window Tint';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'vlt',         'VLT %',         'number','%',   false,false,1,'Details','Visible Light Transmission — lower = darker','e.g. 20'),
  (pt_id,'tint_type',   'Film Type',     'select','"Dyed","Carbon","Ceramic","Crystalline"',
                                                   false,false,2,'Details',null,null),
  (pt_id,'coverage',    'Coverage',      'select','"All Windows","Front Only","Rear Only","All + Windshield Strip","Full including Windshield"',
                                                   false,false,3,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HEAD UNIT
-- ============================================================
select id into pt_id from public.part_types where category = 'Audio' and name = 'Head Unit';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'screen_size',   'Screen Size',    'number','in',  false,false,1,'Details',null,'e.g. 9'),
  (pt_id,'apple_carplay', 'Apple CarPlay',  'boolean',null, false,false,2,'Features',null,null),
  (pt_id,'android_auto',  'Android Auto',   'boolean',null, false,false,3,'Features',null,null),
  (pt_id,'built_in_amp',  'Built-in Amp',   'boolean',null, false,true, 4,'Features',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- AMPLIFIER
-- ============================================================
select id into pt_id from public.part_types where category = 'Audio' and name = 'Amplifier';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'channels',  'Channels',    'select','"Monoblock (1ch)","2-Channel","4-Channel","5-Channel"',
                                               false,false,1,'Details',null,null),
  (pt_id,'rms_watts', 'RMS Watts',   'number','W', false,false,2,'Details','Total RMS power output','e.g. 500'),
  (pt_id,'amp_class', 'Class',       'select','"Class A","Class A/B","Class D"',
                                               false,true, 3,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- SUBWOOFER
-- ============================================================
select id into pt_id from public.part_types where category = 'Audio' and name = 'Subwoofer';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'sub_size',   'Size',       'number','in',  false,false,1,'Details',null,'e.g. 12'),
  (pt_id,'rms_watts',  'RMS Watts',  'number','W',   false,false,2,'Details',null,'e.g. 500'),
  (pt_id,'enclosure',  'Enclosure',  'select','"Sealed","Ported","Bandpass","Free Air"',
                                               false,false,3,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HEADLIGHTS
-- ============================================================
select id into pt_id from public.part_types where category = 'Lighting' and name = 'Headlights';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'bulb_type',    'Bulb Type',       'select','"OEM Halogen","HID / Xenon","LED","CCFL"',
                                                       false,false,1,'Details',null,null),
  (pt_id,'color_temp',   'Color Temp',      'number','K',   false,true, 2,'Details','Color temperature in Kelvin','e.g. 6000'),
  (pt_id,'projector',    'Projector Retrofit','boolean',null,false,true, 3,'Details',null,null),
  (pt_id,'angel_eyes',   'Angel Eyes / DRL','boolean',null, false,true, 4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FUEL INJECTORS
-- ============================================================
select id into pt_id from public.part_types where category = 'Fuel System' and name = 'Fuel Injectors';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'flow_rate',   'Flow Rate',    'number','cc/min',false,false,1,'Specs',null,'e.g. 550'),
  (pt_id,'quantity',    'Quantity',     'number',null,    false,false,2,'Details',null,'e.g. 4, 6'),
  (pt_id,'impedance',   'Impedance',    'select','"High Impedance (Saturated)","Low Impedance (Peak & Hold)"',
                                                   false,true, 3,'Details',null,null),
  (pt_id,'connector',   'Connector',    'select','"EV1 (Jetronic)","EV6 (USCAR)","Denso","Nippon Denso"',
                                                   false,true, 4,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- FUEL PUMP
-- ============================================================
select id into pt_id from public.part_types where category = 'Fuel System' and name = 'Fuel Pump';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'flow_rate',  'Flow Rate',   'number','lph', false,false,1,'Specs','Liters per hour','e.g. 255'),
  (pt_id,'in_tank',    'In-Tank',     'boolean',null,  false,false,2,'Details',null,null),
  (pt_id,'external',   'External',    'boolean',null,  false,false,3,'Details','Inline external pump',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- ENGINE MANAGEMENT / ECU
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Engine Management / ECU';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'ecu_type',  'Type',          'select','"OEM Reflash","Piggyback","Standalone"',
                                                  true, false,1,'Details',null,null),
  (pt_id,'tune_type', 'Tune Type',     'select','"Street (91/93 octane)","E30","E85","Flex Fuel","Race Gas","C16"',
                                                  false,false,2,'Details',null,null),
  (pt_id,'tuner',     'Tuner Name',    'text',  null,  false,false,3,'Details',null,'e.g. Tomei Powered'),
  (pt_id,'tuned_hp',  'HP at Tune',    'number','hp',  false,false,4,'Results','Measured horsepower at this tune','e.g. 320'),
  (pt_id,'tuned_tq',  'Torque at Tune','number','lbft',false,false,5,'Results','Measured torque at this tune','e.g. 295'),
  (pt_id,'dyno_type', 'Dyno Type',     'select','"Dynojet","Mustang","Mainline","Hub Dyno"',
                                                  false,true, 6,'Results',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- PISTONS
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Pistons';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'bore',         'Bore',            'number','mm',   false,false,1,'Specs',null,'e.g. 87'),
  (pt_id,'compression',  'Compression Ratio','text', null,   false,false,2,'Specs',null,'e.g. 9.5:1'),
  (pt_id,'material',     'Material',        'select','"Cast","Hypereutectic","Forged"',
                                                             false,false,3,'Details',null,null),
  (pt_id,'coating',      'Coating',         'select','"None","Thermal Barrier","Skirt Coating","Both"',
                                                             false,true, 4,'Details',null,null),
  (pt_id,'ring_gap',     'Ring Gap',        'text',  null,   false,true, 5,'Details','Top ring gap in thou','e.g. 16 thou')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- CONNECTING RODS
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Connecting Rods';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'length',    'Length',     'number','mm',  false,true, 1,'Specs','Center-to-center length','e.g. 136'),
  (pt_id,'material',  'Material',   'select','"OEM Steel","H-Beam Steel","I-Beam Steel","Titanium","Chromoly"',
                                              false,false,2,'Details',null,null),
  (pt_id,'arp_bolts', 'ARP Bolts',  'boolean',null, false,false,3,'Details','ARP rod bolts installed',null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- COLD AIR INTAKE / SHORT RAM
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Cold Air Intake / Short Ram';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'intake_type', 'Type',         'select','"Cold Air Intake","Short Ram Intake","Ram Air","Velocity Stack"',
                                                   false,false,1,'Details',null,null),
  (pt_id,'pipe_dia',    'Pipe Diameter','number','mm', false,true,2,'Dimensions',null,'e.g. 76'),
  (pt_id,'filter_type', 'Filter Type',  'select','"Dry Filter","Oiled Filter","Washable","Disposable"',
                                                   false,true, 3,'Details',null,null)
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- HEAD UNIT / PORTING
-- ============================================================
select id into pt_id from public.part_types where category = 'Engine' and name = 'Head Work / Porting';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'work_type',  'Work Type',   'select','"Port & Polish","Stage 1","Stage 2","Stage 3","Full Race","3-Angle Valve Job"',
                                                 false,false,1,'Details',null,null),
  (pt_id,'cc_volume',  'CC Volume',   'number','cc',  false,true, 2,'Specs','Combustion chamber volume after work',null),
  (pt_id,'performed_by','Performed By','text', null,  false,false,3,'Details',null,'e.g. JGY Engines')
on conflict (part_type_id, spec_key) do nothing;

-- ============================================================
-- DRIVESHAFT
-- ============================================================
select id into pt_id from public.part_types where category = 'Drivetrain' and name = 'Driveshaft';
insert into public.spec_templates
  (part_type_id, spec_key, spec_label, input_type, unit, required, is_advanced, display_order, group_label, help_text, placeholder)
values
  (pt_id,'material',   'Material',   'select','"OEM Steel","Chromoly","Aluminum","Carbon Fiber"',
                                               false,false,1,'Details',null,null),
  (pt_id,'one_piece',  'One Piece',  'boolean',null, false,true, 2,'Details','Single piece vs two-piece with carrier bearing',null)
on conflict (part_type_id, spec_key) do nothing;

raise notice 'spec_templates seed complete.';

exception
  when others then
    raise notice 'spec_templates seed error: %. Some templates may be missing.', sqlerrm;
end;
$$;

-- =============================================================================
-- STEP 13: Additional indexes for performance
-- =============================================================================

create index if not exists job_specs_key
  on public.job_specs (job_id, spec_key);

create index if not exists jobs_modification_goals
  on public.jobs using gin (modification_goals)
  where modification_goals is not null;

-- Donor fitment community query (future: "what donor calipers fit an S14?")
create index if not exists jobs_donor_make_model
  on public.jobs (donor_make, donor_model)
  where is_donor_part = true;

-- =============================================================================
-- FINAL SUMMARY
-- =============================================================================
-- New tables:     part_types, spec_templates, job_specs
-- Altered tables: users (3 new unit prefs), jobs (10 new columns),
--                 car_reminders (source_job_id + safety category)
-- Updated:        jobs_handle_removal trigger (copies specs + new fields)
--                 public_build_sheet view (donor info + modification goals)
-- Seed data:      ~100 part types, ~250+ spec templates across all categories
-- =============================================================================
