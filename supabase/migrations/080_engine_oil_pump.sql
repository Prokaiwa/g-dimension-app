-- =============================================================================
-- G-DIMENSION — Migration 080: add "Oil Pump" engine part type + spec form
-- =============================================================================
-- The Engine part-type list (rebuilt in 026, the authoritative spec seed) has
-- Oil Pan and Oil Catch Can but no Oil Pump. This adds it right after Oil Pan
-- (both are oiling-system parts), shifting the rest of the Engine list down by
-- one, and gives it a spec form modeled on the 026 Engine templates.
--
-- Follows the migration 058 (Full Aero Kit) pattern exactly: guarded do-block,
-- idempotent, options in the `options` jsonb column (post-025 shape constraint),
-- select fields carry NULL unit. No frontend change — TuningAddPage loads part
-- types + spec_templates from the DB per category (024 header: "Adding a new
-- part type = insert rows into spec_templates. Zero code changes.").
--
-- DEPENDENCY / IMPACT (per DB change protocol):
--   - part_types (024) UNIQUE (category, name) → guard makes the insert a no-op
--     on re-run (and prevents a double display_order shift).
--   - spec_templates (024) must satisfy the 025 Section B constraints:
--       B1 select/multiselect → non-empty jsonb options + (here) NULL unit;
--          other input_types → NULL options.
--       B2 unit_preference ∈ (null,'spring_rate','pressure','temp') — 'pressure'
--          used below for the oil-pressure field.
--   - job_specs (024) reference spec_key by TEXT (no FK) — new keys are inert
--     until a user fills the form. jobs.part_type_id FK is ON DELETE SET NULL.
--   - public_build_sheet view LEFT JOINs part_types on name — a new part type
--     name simply surfaces; no view/trigger/grant change needed (part_types +
--     spec_templates already have public-read RLS + grants from 024).
-- =============================================================================

do $$
declare pt_id integer;
begin
  if exists (
    select 1 from public.part_types
    where category = 'Engine' and name = 'Oil Pump'
  ) then
    raise notice 'Oil Pump already present — skipping migration 080';
    return;
  end if;

  -- Open the slot right after Oil Pan (display_order 19); shift the rest down.
  update public.part_types
    set display_order = display_order + 1
    where category = 'Engine' and display_order >= 20;

  -- Insert the new part type at position 20.
  insert into public.part_types (category, name, display_order, is_active)
    values ('Engine', 'Oil Pump', 20, true)
    returning id into pt_id;

  -- Spec form (modeled on the 026 Engine templates: full column list).
  insert into public.spec_templates
    (part_type_id, spec_key, spec_label, input_type, unit, options, unit_preference,
     required, is_advanced, display_order, group_label, help_text, placeholder)
  values
    -- Type / capacity
    (pt_id, 'pump_type', 'Pump Type', 'select', null,
      '["OEM / Stock Replacement","High-Volume","High-Pressure","High-Volume & High-Pressure","Blueprinted OEM"]'::jsonb,
      null, true, false, 1, 'Type',
      'High-volume moves more oil; high-pressure raises the relief setting', null),
    (pt_id, 'sump_type', 'Sump Type', 'select', null,
      '["Wet Sump","Dry Sump"]'::jsonb,
      null, false, false, 2, 'Type',
      'Dry sump = external multi-stage pump feeding a remote tank', null),
    (pt_id, 'gear_material', 'Gear Material', 'select', null,
      '["OEM","Nitrided","Billet Steel","Sintered"]'::jsonb,
      null, false, false, 3, 'Specs',
      'Nitrided/billet gears resist crack failure at high RPM (e.g. RB26 N1)', null),
    -- Performance specs (advanced)
    (pt_id, 'volume_increase', 'Volume Increase', 'text', null, null,
      null, false, true, 4, 'Specs',
      'Extra flow over stock', 'e.g. +25%'),
    (pt_id, 'relief_pressure', 'Relief Pressure', 'number', 'psi', null,
      'pressure', false, true, 5, 'Specs',
      'Pressure the relief valve opens at (uprated spring)', 'e.g. 90'),
    (pt_id, 'stages', 'Dry Sump Stages', 'number', null, null,
      null, false, true, 6, 'Specs',
      'Total scavenge + pressure stages (dry sump only)', 'e.g. 4'),
    -- Build details (advanced)
    (pt_id, 'crank_collar', 'Crank Collar / Drive Upgrade', 'boolean', null, null,
      null, false, true, 7, 'Details',
      'Uprated oil-pump drive collar (e.g. RB26 N1 pump collar mod)', null),
    (pt_id, 'blueprinted', 'Blueprinted', 'boolean', null, null,
      null, false, true, 8, 'Details',
      'Clearances measured and set by hand', null),
    -- Source
    (pt_id, 'brand', 'Brand', 'text', null, null,
      null, false, false, 9, 'Source', null, 'Nismo, Tomei, Melling, ATI, Boundary'),
    (pt_id, 'model_text', 'Model', 'text', null, null,
      null, false, false, 10, 'Source', null, null);
end $$;
