-- 063_car_mileage_unit.sql
-- Per-car odometer DISPLAY unit. cars.current_mileage (and sessions.mileage)
-- stay stored in miles (base) — this column only controls how mileage is shown
-- and entered for THIS car. Cars imported to the US but kept in km can display
-- km without the owner flipping their global distance setting (which governs
-- every car). Additive, nullable-with-default, no policy/grant change (cars RLS
-- already covers it). Idempotent.

alter table public.cars
  add column if not exists mileage_unit text not null default 'mi'
  check (mileage_unit in ('mi','km'));

comment on column public.cars.mileage_unit is
  'Per-car odometer display unit (mi|km). current_mileage stays in miles; convert at display. Default mi. See migration 063.';

-- ── Refresh public_car_profiles to expose mileage_unit (the public Garage
-- mirrors the private carousel, so it needs the same per-car unit). CREATE OR
-- REPLACE VIEW can only APPEND columns; the live view ends with featured_layout
-- (migration 055), so mileage_unit is appended last. ──
create or replace view public.public_car_profiles as
  select
    c.id, c.user_id, c.year, c.make, c.model, c."trim", c.variant_id,
    c.chassis_code, c.nickname, c.color, c.engine_type, c.transmission,
    c.drivetrain, c.forced_induction, c.horsepower, c.torque,
    c.current_mileage, c.is_import, c.garage_photo_url, c.showcase_photo_url,
    c.photo_y_offset, c.purchase_story, c.purchase_date, c.is_public,
    c.show_investment_publicly, c.created_at,
    u.username, u.display_name, u.avatar_url, u.city, u.country,
    c.usage_type, c.engine_origin, c.weight_lbs,
    c.build_sheet_power_photo, c.build_sheet_chassis_photo,
    c.build_sheet_exterior_photo, c.build_sheet_interior_photo,
    c.original_photo_url, c.cover_focus_x, c.cover_focus_y, c.cover_zoom,
    case when c.show_featured_publicly then c.featured_story else null end as featured_story,
    c.show_buildsheet_publicly,
    c.show_timeline_publicly,
    c.show_featured_publicly,
    u.active_car_id,
    c.variant,
    case when c.show_featured_publicly then c.featured_layout else null end as featured_layout,
    -- appended (063): per-car odometer display unit
    c.mileage_unit
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
