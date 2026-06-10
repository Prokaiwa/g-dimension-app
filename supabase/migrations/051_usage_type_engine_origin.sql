-- 051_usage_type_engine_origin.sql
-- Add usage_type and engine_origin to cars.
-- usage_type  — primary use category (street/daily/track/drift/drag/show/vip/offroad)
-- engine_origin — original factory engine or a swap
--
-- CREATE OR REPLACE = append-only: preserves grants, ownership, and the
-- is_public privacy gate. The 7 new columns stay appended at the end and
-- no existing column is removed/reordered.

alter table public.cars
  add column if not exists usage_type text
    check (usage_type in ('street','daily','track','drift','drag','show','vip','offroad')),
  add column if not exists engine_origin text
    check (engine_origin in ('original','swapped'));

comment on column public.cars.usage_type is
  'Primary intended use; backbone input for the Feature archetype engine. '
  'Null = unspecified (engine uses restraint register). Includes vip (bippu).';
comment on column public.cars.engine_origin is
  'Engine provenance only: original | swapped. Null = no claim. When swapped, '
  'engine_type holds the swapped-in engine. Built/forged is derived from mods.';

create or replace view public.public_car_profiles as
  select
    c.id,
    c.user_id,
    c.year,
    c.make,
    c.model,
    c."trim",
    c.variant_id,
    c.chassis_code,
    c.nickname,
    c.color,
    c.engine_type,
    c.transmission,
    c.drivetrain,
    c.forced_induction,
    c.horsepower,
    c.torque,
    c.current_mileage,
    c.is_import,
    c.garage_photo_url,
    c.showcase_photo_url,
    c.photo_y_offset,
    c.purchase_story,
    c.purchase_date,
    c.is_public,
    c.show_investment_publicly,
    c.created_at,
    u.username,
    u.display_name,
    u.avatar_url,
    u.city,
    u.country,
    -- appended for the Feature engine (append only — do not reorder above):
    c.usage_type,
    c.engine_origin,
    c.weight_lbs,
    c.build_sheet_power_photo,
    c.build_sheet_chassis_photo,
    c.build_sheet_exterior_photo,
    c.build_sheet_interior_photo
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
