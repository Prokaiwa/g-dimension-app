-- 055_featured_layout.sql
-- Editable editorial copy for the Featured magazine cover (and, forward-compatible,
-- photo-spread captions). A single nullable JSONB column on cars holds everything
-- the owner overrides on top of the deterministic editorial engine.
--
-- Why ONE jsonb column (not per-field columns):
--   • The overrides are sparse and optional — most cars never set any.
--   • Captions are keyed PER PHOTO, which can't be a fixed column set.
--   • New editable slots (pull quotes, section intros) can be added with zero
--     schema churn.
--   • It rides through public_car_profiles as a single column.
--
-- Shape (all keys optional):
--   {
--     "headline": "user text",            -- overrides engine headline on the cover
--     "deck":     "user text",            -- overrides engine deck on the cover
--     "captions": { "<photoKey>": "..." },-- keyed by STABLE photo key, NOT url
--                                          --   (build group: "bsg:power" etc;
--                                          --    timeline note: "tl:<entryId>")
--                                          --   so re-uploading a photo never orphans
--                                          --   its caption.
--     -- Snapshot of what the engine produced when the user last saw/edited.
--     -- Lets the frontend quietly flag (a dot on the edit pencil) when fresh
--     -- engine output diverges from a stored snapshot — so a user who later adds
--     -- mods can discover the updated suggestion without being nagged. Cleared/
--     -- refreshed whenever they save. Never written until the user customizes.
--     "generated_headline": "engine text at last edit",
--     "generated_deck":     "engine text at last edit",
--     "generated_captions": { "<photoKey>": "engine text at last edit" }
--   }

alter table public.cars
  add column if not exists featured_layout jsonb;

comment on column public.cars.featured_layout is
  'Featured magazine editorial overrides (headline/deck/captions) + a snapshot of the engine output at last edit for quiet "suggestion updated" hints. NULL = fully engine-generated. See migration 055.';

-- ── Refresh the public view: expose featured_layout, withheld when the Featured
-- room is private (mirrors how featured_story is nulled in 053).
-- NOTE: CREATE OR REPLACE VIEW can only APPEND columns (never reorder/insert into
-- the middle), so featured_layout goes LAST after active_car_id. ──
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
    -- Featured story is withheld when the Featured room is private:
    case when c.show_featured_publicly then c.featured_story else null end as featured_story,
    c.show_buildsheet_publicly,
    c.show_timeline_publicly,
    c.show_featured_publicly,
    u.active_car_id,
    -- appended (055): Featured editorial overrides, withheld when private:
    case when c.show_featured_publicly then c.featured_layout else null end as featured_layout
  from cars c
  join users u on u.id = c.user_id
  where c.is_public = true
    and c.deleted_at is null
    and u.deleted_at is null;

notify pgrst, 'reload schema';
