-- =====================================================================
-- Migration 025: Part Spec System Cleanup
-- =====================================================================
-- Purpose: Fix the seven structural issues identified in the post-024
--          architectural audit. Pre-launch cleanup. No user data exists
--          yet, so we can use destructive operations freely.
--
-- Sections:
--   A. Backfill options column / clear misused unit values
--   B. Add shape constraints to spec_templates
--   C. Drop redundant indexes
--   D. part_categories lookup table + FKs
--   E. Reconcile is_custom_spec / is_custom redundancy
--   F. spec_value strict validation trigger
--   G. Safety expiry auto-reminder trigger
--   H. Replace silent seed exception handler pattern (documentation only)
--
-- Safety: Wrapped in BEGIN/COMMIT. Every section is idempotent where
--         possible. If anything fails, the whole thing rolls back.
-- =====================================================================

begin;

-- =====================================================================
-- SECTION A: Backfill options from misused unit column
-- =====================================================================
-- Problem: Every select/multiselect spec_template stuffed its option list
--          into the `unit` column as a quasi-CSV string like
--          '"Summer","Winter","Track"'. The dedicated `options jsonb`
--          column was 100% unused.
--
-- Fix:     Parse the misused unit string into a real jsonb array, write
--          it to options, and NULL out unit for those rows.
--
-- The misused unit values all begin with a double-quote character because
-- they were authored as quoted CSV. Real unit values ('mm', 'psi', 'in')
-- never start with a quote. That's our discriminator.
-- =====================================================================

-- Sanity check: how many rows are affected
do $$
declare
  affected_count integer;
begin
  select count(*) into affected_count
  from public.spec_templates
  where input_type in ('select', 'multiselect')
    and unit is not null
    and unit like '"%';

  raise notice 'Section A: backfilling % select/multiselect templates', affected_count;
end $$;

-- Backfill: wrap the CSV-ish unit string in brackets and cast to jsonb
update public.spec_templates
set
  options = ('[' || unit || ']')::jsonb,
  unit    = null
where input_type in ('select', 'multiselect')
  and options is null
  and unit is not null
  and unit like '"%';

-- Verify: every select/multiselect now has options populated
do $$
declare
  unfixed integer;
begin
  select count(*) into unfixed
  from public.spec_templates
  where input_type in ('select', 'multiselect')
    and (options is null or jsonb_typeof(options) != 'array');

  if unfixed > 0 then
    raise exception 'Section A: % select/multiselect templates still missing valid options', unfixed;
  end if;

  raise notice 'Section A: all select/multiselect templates have valid options arrays';
end $$;

-- =====================================================================
-- SECTION B: Shape constraints on spec_templates
-- =====================================================================
-- Now that options is populated correctly, lock the shape so future
-- inserts can't repeat the original mistake.
-- =====================================================================

-- B1: select/multiselect must have non-empty options array
--     other input_types must have NULL options
alter table public.spec_templates
  add constraint spec_templates_options_shape check (
    (input_type in ('select', 'multiselect')
       and options is not null
       and jsonb_typeof(options) = 'array'
       and jsonb_array_length(options) > 0)
    or
    (input_type not in ('select', 'multiselect')
       and options is null)
  );

-- B2: unit_preference must match a known user preference column
--     (silent typos like 'spring rate' vs 'spring_rate' previously broke
--      unit conversion with no error)
alter table public.spec_templates
  add constraint spec_templates_unit_preference_check check (
    unit_preference is null
    or unit_preference in ('spring_rate', 'pressure', 'temp')
  );

-- =====================================================================
-- SECTION C: Drop redundant indexes
-- =====================================================================
-- Three indexes were effectively covering (job_id, spec_key) on job_specs,
-- and two were covering (donor_make, donor_model, ...) on jobs.
-- Postgres serves leftmost-prefix queries from the wider index for free,
-- so the narrower duplicates only cost write performance.
-- =====================================================================

-- C1: job_specs unique constraint on (job_id, spec_key) already creates
--     a btree. These two indexes are redundant.
drop index if exists public.job_specs_job_id;
drop index if exists public.job_specs_key;

-- C2: jobs_donor_fitment is (donor_make, donor_model, donor_year).
--     jobs_donor_make_model is (donor_make, donor_model). The wider
--     index serves both query shapes from the leftmost prefix.
drop index if exists public.jobs_donor_make_model;

-- =====================================================================
-- SECTION D: part_categories lookup + FKs
-- =====================================================================
-- Problem: jobs.category and part_types.category are free text. A typo
--          like 'Forced induction' (lowercase i) makes the spec form
--          silently disappear for that job.
--
-- Fix:     Anchor both columns to a small lookup table.
-- =====================================================================

create table if not exists public.part_categories (
  name          text primary key,
  display_order integer not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.part_categories is
  'Canonical list of part categories. Anchors jobs.category and part_types.category to prevent typo-based silent failures.';

-- Seed with the canonical 17 categories. Order matches Master Architecture
-- Part 11 (Build Sheet category order).
insert into public.part_categories (name, display_order) values
  ('Engine',           1),
  ('Drivetrain',       2),
  ('Suspension',       3),
  ('Brakes',           4),
  ('Wheels & Tires',   5),
  ('Forced Induction', 6),
  ('Exhaust',          7),
  ('Cooling',          8),
  ('Fuel System',      9),
  ('Electrical',      10),
  ('Audio',           11),
  ('Lighting',        12),
  ('Safety',          13),
  ('Exterior',        14),
  ('Paint & Wrap',    15),
  ('Interior',        16),
  ('Other',           17)
on conflict (name) do nothing;

-- Verify all existing values in dependent tables match the lookup before
-- adding the FK. If any rows reference a non-canonical value, fail loudly
-- so we can investigate before the FK rejects them.
do $$
declare
  bad_pt integer;
  bad_jobs integer;
begin
  select count(*) into bad_pt
  from public.part_types pt
  where not exists (
    select 1 from public.part_categories pc where pc.name = pt.category
  );

  select count(*) into bad_jobs
  from public.jobs j
  where j.category is not null
    and not exists (
      select 1 from public.part_categories pc where pc.name = j.category
    );

  if bad_pt > 0 then
    raise exception 'Section D: % part_types rows have non-canonical category values', bad_pt;
  end if;

  if bad_jobs > 0 then
    raise exception 'Section D: % jobs rows have non-canonical category values', bad_jobs;
  end if;

  raise notice 'Section D: all category values are canonical, safe to add FKs';
end $$;

-- Add the FKs. ON UPDATE CASCADE so renaming a category propagates.
-- ON DELETE RESTRICT so you can't accidentally orphan rows.
alter table public.part_types
  add constraint part_types_category_fk
    foreign key (category) references public.part_categories(name)
    on update cascade on delete restrict;

alter table public.jobs
  add constraint jobs_category_fk
    foreign key (category) references public.part_categories(name)
    on update cascade on delete restrict;

-- =====================================================================
-- SECTION E: Reconcile is_custom_spec vs is_custom
-- =====================================================================
-- Problem: jobs.is_custom_spec and job_specs.is_custom captured the
--          same concept at different granularities with no enforced
--          relationship.
--
-- Fix:     Drop jobs.is_custom_spec. The per-row job_specs.is_custom
--          is more granular and is what the audit trigger and form
--          rendering care about.
--
-- Note:    The public_build_sheet view (created in 024) references
--          jobs.is_custom_spec, so we must drop+recreate the view.
--          We also fix a latent issue: the original view used INNER JOIN
--          on sessions, which excluded Blueprint/Parts Bin jobs (where
--          session_id IS NULL) from the public Build Sheet. We change
--          that to LEFT JOIN.
--
-- Pre-launch we have no user data, so dropping the column is safe.
-- =====================================================================

drop view if exists public.public_build_sheet;

alter table public.jobs
  drop column if exists is_custom_spec;

-- Recreate the view without is_custom_spec, and with LEFT JOIN on sessions
-- so Blueprint and Parts Bin jobs aren't silently excluded from public profiles.
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
  j.part_type_id,
  pt.name          as part_type_name,
  j.is_donor_part,
  j.donor_make,
  j.donor_model,
  j.donor_year,
  j.donor_part,
  j.fabrication_required,
  j.modification_goals,
  j.created_at,
  c.user_id,
  c.year           as car_year,
  c.make           as car_make,
  c.model          as car_model,
  c.nickname       as car_nickname,
  c.is_public      as car_is_public
from public.jobs j
left join public.part_types pt on pt.id = j.part_type_id
left join public.sessions s on s.id = j.session_id
join public.cars c on c.id = j.car_id
where
  j.status = 'installed'
  and j.type = 'modification'
  and c.is_public = true
  and c.deleted_at is null;

comment on view public.public_build_sheet is
  'Public Build Sheet. Installed mods for public cars. Cost and fabrication notes excluded. LEFT JOIN on sessions includes Blueprint/Parts Bin jobs.';

grant select on public.public_build_sheet to anon, authenticated;

-- =====================================================================
-- SECTION F: Strict spec_value validation trigger
-- =====================================================================
-- Problem: spec_value is text. Nothing prevents 'banana' from being
--          stored in a number-typed spec, which would crash any future
--          AVG()/MIN()/MAX() analytics with a single bad row.
--
-- Fix:     Validate every insert/update against the declaring template's
--          input_type. Reject values that don't parse cleanly.
--
-- Behavior:
--   - is_custom = true rows skip validation (no template to validate against)
--   - number: must parse as numeric
--   - boolean: must be exactly 'true' or 'false'
--   - date: must parse as date
--   - select: value must be one of the options jsonb array
--   - multiselect: value (jsonb array) must be subset of options
--   - text/longtext: no validation (any string is valid)
-- =====================================================================

create or replace function public.job_specs_validate_value()
returns trigger
language plpgsql
as $$
declare
  v_input_type    text;
  v_options       jsonb;
  v_part_type_id  integer;
begin
  -- Custom (free-form) specs have no template to validate against
  if new.is_custom then
    return new;
  end if;

  -- NULL values are allowed (means "user cleared the field")
  if new.spec_value is null then
    return new;
  end if;

  -- Look up the template's input_type and options via the parent job's
  -- part_type_id. If no template exists, the spec_key is invalid for
  -- this job's part type.
  select j.part_type_id into v_part_type_id
  from public.jobs j
  where j.id = new.job_id;

  if v_part_type_id is null then
    -- Job has no part_type_id (e.g., type='maintenance'). Skip validation.
    return new;
  end if;

  select st.input_type, st.options
    into v_input_type, v_options
  from public.spec_templates st
  where st.part_type_id = v_part_type_id
    and st.spec_key = new.spec_key;

  if v_input_type is null then
    raise exception
      'No spec_template found for part_type_id=% spec_key=% (job_id=%). Set is_custom=true if this is intentional.',
      v_part_type_id, new.spec_key, new.job_id;
  end if;

  -- Type-specific validation
  if v_input_type = 'number' then
    begin
      perform new.spec_value::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception
        'spec_value % is not a valid number for spec_key=% (job_id=%)',
        quote_literal(new.spec_value), new.spec_key, new.job_id;
    end;

  elsif v_input_type = 'boolean' then
    if new.spec_value not in ('true', 'false') then
      raise exception
        'spec_value % must be exactly ''true'' or ''false'' for spec_key=% (job_id=%)',
        quote_literal(new.spec_value), new.spec_key, new.job_id;
    end if;

  elsif v_input_type = 'date' then
    begin
      perform new.spec_value::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception
        'spec_value % is not a valid date for spec_key=% (job_id=%)',
        quote_literal(new.spec_value), new.spec_key, new.job_id;
    end;

  elsif v_input_type = 'select' then
    -- Must be one of the options array entries
    if not (v_options ? new.spec_value) then
      raise exception
        'spec_value % is not a valid option for spec_key=% (job_id=%). Allowed: %',
        quote_literal(new.spec_value), new.spec_key, new.job_id, v_options::text;
    end if;

  elsif v_input_type = 'multiselect' then
    -- spec_value must be a jsonb array; every element must be in options
    declare
      v_value_array jsonb;
      v_elem        text;
    begin
      v_value_array := new.spec_value::jsonb;

      if jsonb_typeof(v_value_array) != 'array' then
        raise exception
          'multiselect spec_value must be a JSON array for spec_key=% (job_id=%)',
          new.spec_key, new.job_id;
      end if;

      for v_elem in select jsonb_array_elements_text(v_value_array)
      loop
        if not (v_options ? v_elem) then
          raise exception
            'spec_value element % is not a valid option for spec_key=% (job_id=%). Allowed: %',
            quote_literal(v_elem), new.spec_key, new.job_id, v_options::text;
        end if;
      end loop;
    exception when invalid_text_representation then
      raise exception
        'multiselect spec_value % is not valid JSON for spec_key=% (job_id=%)',
        quote_literal(new.spec_value), new.spec_key, new.job_id;
    end;

  end if;

  -- text and longtext have no validation
  return new;
end $$;

comment on function public.job_specs_validate_value is
  'Validates job_specs.spec_value against the declaring spec_templates.input_type. Strict: rejects invalid values at insert/update time.';

drop trigger if exists job_specs_validate on public.job_specs;
create trigger job_specs_validate
  before insert or update on public.job_specs
  for each row execute procedure public.job_specs_validate_value();

-- =====================================================================
-- SECTION G: Safety expiry auto-reminder
-- =====================================================================
-- Problem: Three Safety part_types (Harness, Helmet, Fire Suppression)
--          have help_text promising 'App will create a reminder
--          automatically' for expiry dates. The car_reminders table even
--          has a source_job_id column added in anticipation. But no
--          trigger ever creates the reminder.
--
-- Fix:     Build the trigger. Fires when a job_specs row is inserted/
--          updated with spec_key = 'expiry_date' on a job in category
--          'Safety'. Idempotent via source_job_id dedup index.
-- =====================================================================

-- Dedup index for the ON CONFLICT clause. One reminder per job.
create unique index if not exists car_reminders_source_job_id
  on public.car_reminders (source_job_id)
  where source_job_id is not null;

create or replace function public.job_specs_create_safety_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_car_id    uuid;
  v_category  text;
  v_title     text;
  v_due_date  date;
begin
  -- Only fires for the well-known expiry spec keys
  if new.spec_key not in ('expiry_date', 'expiration_date') then
    return new;
  end if;

  -- Only Safety category gets auto-reminders. Look up the parent job.
  select j.car_id, j.category, j.title
    into v_car_id, v_category, v_title
  from public.jobs j
  where j.id = new.job_id;

  if v_category != 'Safety' or v_car_id is null then
    return new;
  end if;

  -- Parse the date. The validation trigger in Section F has already
  -- guaranteed it's a valid date by this point.
  begin
    v_due_date := new.spec_value::date;
  exception when others then
    -- Defensive: if somehow malformed, skip reminder creation rather
    -- than aborting the whole insert
    return new;
  end;

  -- Idempotent insert. ON UPDATE we want to update the existing reminder's
  -- due_date to match the new spec value.
  insert into public.car_reminders
    (car_id, title, category, due_date, source_job_id)
  values
    (v_car_id, v_title || ' expiry', 'safety', v_due_date, new.job_id)
  on conflict (source_job_id)
    where source_job_id is not null
    do update set
      due_date = excluded.due_date,
      title    = excluded.title;

  return new;
end $$;

comment on function public.job_specs_create_safety_reminder is
  'Auto-creates a car_reminder when a Safety job has an expiry_date spec. Idempotent on source_job_id.';

drop trigger if exists job_specs_safety_reminder on public.job_specs;
create trigger job_specs_safety_reminder
  after insert or update on public.job_specs
  for each row execute procedure public.job_specs_create_safety_reminder();

-- =====================================================================
-- SECTION H: Documentation note on seed exception handling
-- =====================================================================
-- Migration 024 wrapped its 250+ spec_template inserts in a single
-- `exception when others then raise notice` block. That swallowed any
-- seed error and let the migration "succeed" with partial data.
--
-- This migration is structured to fail loudly (no exception handler).
-- The next domain migration (026) will use SELECT INTO STRICT for every
-- part_type lookup so a typo raises NO_DATA_FOUND instead of producing
-- silent NULLs.
--
-- No SQL changes here. This section exists to document the policy
-- shift for future migrations.
-- =====================================================================

commit;

-- =====================================================================
-- POST-MIGRATION VERIFICATION
-- =====================================================================
-- Run these manually after applying to confirm the migration worked.
-- They are not part of the transaction.
-- =====================================================================

-- Check 1: every select/multiselect has an options array
-- expect: 0
-- select count(*) from public.spec_templates
-- where input_type in ('select','multiselect')
--   and (options is null or jsonb_array_length(options) = 0);

-- Check 2: no select/multiselect has a misused unit value
-- expect: 0
-- select count(*) from public.spec_templates
-- where input_type in ('select','multiselect')
--   and unit is not null;

-- Check 3: redundant indexes are gone
-- expect: 0 rows
-- select indexname from pg_indexes
-- where indexname in ('job_specs_job_id', 'job_specs_key', 'jobs_donor_make_model');

-- Check 4: part_categories has 17 rows
-- expect: 17
-- select count(*) from public.part_categories;

-- Check 5: validation trigger rejects bad data
-- expect: error
-- insert into public.job_specs (job_id, spec_key, spec_value, is_custom)
-- values ('<some-job-id>', 'target_boost', 'banana', false);
