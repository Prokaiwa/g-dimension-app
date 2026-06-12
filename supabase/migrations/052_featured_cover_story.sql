-- 052_featured_cover_story.sql
-- Featured magazine: user cover framing + the user-written feature story.
--
-- cover_focus_x / cover_focus_y — object-position percentages (0–100) for the
--   full cover photo. cover_zoom — scale factor (1–2.5). All three NULLABLE
--   with NO default: NULL means "never framed" and the cover keeps its legacy
--   aspect-heuristic contain layout; once the user saves a framing, the cover
--   switches to cover-fit with these values. (A default of 50/50/1 would be
--   indistinguishable from a deliberate center framing.)
--
-- featured_story — the magazine-voice feature article, written BY the user FOR
--   the Featured spread. Deliberately separate from cars.purchase_story (the
--   first-person Origin diary on the Timeline): the two registers are
--   different kinds of writing. NULL/empty = the book has no story page.

alter table public.cars
  add column if not exists cover_focus_x numeric,
  add column if not exists cover_focus_y numeric,
  add column if not exists cover_zoom    numeric,
  add column if not exists featured_story text;

comment on column public.cars.cover_focus_x is
  'Featured cover framing: object-position X percent (0-100). NULL = never framed (legacy contain layout).';
comment on column public.cars.cover_focus_y is
  'Featured cover framing: object-position Y percent (0-100).';
comment on column public.cars.cover_zoom is
  'Featured cover framing: scale factor (1-2.5).';
comment on column public.cars.featured_story is
  'User-written magazine-voice feature article for the Featured story spread. Distinct from purchase_story (Timeline Origin diary voice).';

-- Refresh the public view (append-only — never reorder existing columns) so a
-- future public Featured page can render the framed cover + story.
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
    c.build_sheet_interior_photo,
    -- appended for Featured cover + story (052):
    c.original_photo_url,
    c.cover_focus_x,
    c.cover_focus_y,
    c.cover_zoom,
    c.featured_story
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
