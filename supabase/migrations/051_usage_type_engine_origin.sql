-- 051_usage_type_engine_origin.sql
-- Add usage_type and engine_origin to cars.
-- usage_type  — primary use category (street/daily/track/drift/drag/show/vip/offroad)
-- engine_origin — original factory engine or a swap

alter table public.cars
  add column if not exists usage_type text
    check (usage_type in ('street','daily','track','drift','drag','show','vip','offroad')),
  add column if not exists engine_origin text
    check (engine_origin in ('original','swapped'));

-- Extend the public profile view to include new columns plus a few that were
-- missing (weight_lbs, build_sheet_*_photo).
drop view if exists public.public_car_profiles;

create view public.public_car_profiles as
select
  c.id,
  c.user_id,
  c.year,
  c.make,
  c.model,
  c.variant,
  c.trim,
  c.color,
  c.chassis_code,
  c.engine_type,
  c.engine_origin,
  c.forced_induction,
  c.horsepower,
  c.torque,
  c.transmission,
  c.drivetrain,
  c.usage_type,
  c.tire_size,
  c.current_mileage,
  c.nickname,
  c.garage_photo_url,
  c.showcase_photo_url,
  c.show_investment_publicly,
  c.build_sheet_power_photo,
  c.build_sheet_chassis_photo,
  c.build_sheet_exterior_photo,
  c.build_sheet_interior_photo,
  u.username,
  u.display_name
from public.cars c
join public.users u on u.id = c.user_id
where c.deleted_at is null;

notify pgrst, 'reload schema';
