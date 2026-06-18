-- 054_public_car_variant.sql
-- Expose cars.variant (free-text sub-model, migration 044) on the public car
-- profile view so the public Garage can render the full display name
-- ("2006 LS 430") exactly like the private Garage carousel. The view already
-- exposed variant_id (the empty future-catalog FK) but never the free-text
-- variant column, so /builds/:username had no way to show it.
--
-- Additive, view-only refresh — no new columns, no policy/grant changes
-- (public_car_profiles already granted to anon, authenticated). Mirrors the
-- 053 definition verbatim with c.variant appended next to c.model.

create or replace view public.public_car_profiles as
  select
    c.id, c.user_id, c.year, c.make, c.model, c.variant, c."trim", c.variant_id,
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
    u.active_car_id
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

grant select on public.public_car_profiles to anon, authenticated;

notify pgrst, 'reload schema';
