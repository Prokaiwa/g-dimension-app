-- 070_public_profile_bio.sql
-- Exposes users.bio + users.country_code through public_car_profiles for the
-- visitor-facing "driver card" on /builds/:username (avatar/name/location were
-- already in the view; the bio a user writes on their profile was invisible to
-- every visitor until now).
--
-- View-only refresh — no RLS/grant changes needed: anon's SELECT grant on the
-- view (023) is table-level, so appended columns are covered, and the users
-- read grant/policy (015/027) already spans these columns.
-- CREATE OR REPLACE VIEW can only APPEND columns — the live view's definition
-- is 063's (last column c.mileage_unit), so bio/country_code are appended last.
--
-- Idempotent. Run in the Supabase SQL editor.

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
    -- appended (070): visitor identity / driver card
    u.bio,
    u.country_code
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
