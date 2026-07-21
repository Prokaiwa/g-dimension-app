-- 077_license_grade.sql
-- PENDING — apply in the Supabase SQL editor (after 076).
--
-- The G-Dimension Permit's public grade badge. `users.license_grade` stores the
-- owner's current permit grade id ('C'|'B'|'A'|'IA'|'S', or NULL = not yet
-- licensed / never computed). It's written client-side whenever the owner
-- views their Profile (where the grade is already computed from ALL their data,
-- including private cars) — so the persisted grade is the TRUE grade. A public
-- visitor can only see public-car data, so recomputing publicly would
-- understate it; reading the persisted value is both correct and cheap.
--
-- Display-only, non-sensitive (a single letter, not the underlying counts).
-- Exposed via the definer view public_car_profiles (like bio/country in 070) —
-- no anon column grant change needed. Idempotent.

alter table public.users
  add column if not exists license_grade text;

comment on column public.users.license_grade is
  'G-Dimension Permit grade id (C|B|A|IA|S). Written client-side on Profile view from the full (all-cars) computation; shown as a badge on the public /builds driver card. NULL = not yet licensed.';

-- Refresh the public view to expose it (append-only column list).
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
    u.distance_unit,
    u.power_unit,
    u.torque_unit,
    -- appended (077): the owner's permit grade for the public driver-card badge
    u.license_grade
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
