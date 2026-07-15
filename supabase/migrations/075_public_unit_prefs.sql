-- 075_public_unit_prefs.sql
-- Expose the owner's display-unit preferences on public_car_profiles so the
-- public /builds pages can render power/torque in the units the owner chose in
-- Settings (ADR: public build pages show the OWNER's units, like a printed spec
-- sheet — consistent for every visitor including anonymous, which is most public
-- traffic). Values are stored in base units (hp / lb-ft / miles); these only
-- govern display.
--
-- public_car_profiles is a definer view (no security_invoker), so it executes
-- with owner privileges — adding these columns to the SELECT is sufficient and
-- no change to the anon column grant on `users` (migration 071) is required.
-- The three columns are non-sensitive display preferences.
--
-- CREATE OR REPLACE can only restate the whole view, so this repeats 070's
-- column list verbatim and appends distance_unit / power_unit / torque_unit.
-- Additive, view-only. Idempotent.

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
    c.mileage_unit,
    u.bio,
    u.country_code,
    -- appended (075): owner's display-unit preferences (power/torque; distance
    -- for completeness — the public pages use mileage_unit for odometer display)
    u.distance_unit,
    u.power_unit,
    u.torque_unit
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
