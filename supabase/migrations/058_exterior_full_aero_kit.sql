-- =============================================================================
-- G-DIMENSION — Migration 058: add "Full Aero Kit" exterior part type
-- =============================================================================
-- Adds a 4th Exterior option, "Full Aero Kit", positioned right after Side Skirts
-- (display_order 3), shifting the rest of the Exterior list down by one. Gives it
-- a spec form mirroring Side Skirts (Type / Material / Brand / Model), kit-flavored.
--
-- Applied manually to production 2026-06-22 (part_types.id = 172 there); this
-- migration reproduces it on a fresh build. Idempotent — guarded so it is a no-op
-- if the part type already exists, which also prevents a double display_order shift.
-- =============================================================================

do $$
declare pt_id integer;
begin
  if exists (
    select 1 from public.part_types
    where category = 'Exterior' and name = 'Full Aero Kit'
  ) then
    raise notice 'Full Aero Kit already present — skipping migration 058';
    return;
  end if;

  -- Open slot 4 (Side Skirts stays at 3); shift everything below down by one.
  update public.part_types
    set display_order = display_order + 1
    where category = 'Exterior' and display_order >= 4;

  -- Insert the new part type at position 4.
  insert into public.part_types (category, name, display_order, is_active)
    values ('Exterior', 'Full Aero Kit', 4, true)
    returning id into pt_id;

  -- Spec form (mirrors Side Skirts, kit-appropriate).
  insert into public.spec_templates
    (part_type_id, spec_key, spec_label, input_type, options, required, is_advanced, display_order, group_label)
  values
    (pt_id, 'kit_type', 'Type', 'select',
      '["OEM / Factory Optional","Aftermarket Full Kit","Replica / Style Kit","Custom / One-off"]'::jsonb,
      true, false, 1, 'Type'),
    (pt_id, 'material', 'Material', 'select',
      '["Polyurethane","FRP","Carbon Fiber","ABS Plastic","Fiberglass"]'::jsonb,
      false, false, 2, 'Specs'),
    (pt_id, 'brand', 'Brand', 'text', null,
      false, false, 3, 'Source'),
    (pt_id, 'model_text', 'Model', 'text', null,
      false, false, 4, 'Source');
end $$;
