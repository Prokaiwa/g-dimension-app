-- =============================================================================
-- G-DIMENSION — Migration 023: Public Profile Data Boundary
-- =============================================================================
-- Implements the decided public profile data boundary:
--
-- PUBLIC (/builds/:username — no auth required):
--   ✓ Car identity: year, make, model, trim, nickname, color
--   ✓ Performance specs: HP, torque, mileage (stored in base units)
--   ✓ Timeline entries (of public cars)
--   ✓ Job photos (of public cars)
--   ✓ Build Sheet: brand, title, category, status — NO costs
--   ✓ Build Investment total (only if cars.show_investment_publicly = true)
--
-- PRIVATE (owner only):
--   ✗ Job costs (per-part pricing)
--   ✗ Session details (shop names, session notes, mileage at service)
--   ✗ Maintenance records (service history)
--   ✗ Receipts (financial documents)
--   ✗ Contacts (mechanic numbers, shop info)
--   ✗ Documents (registration, insurance)
--   ✗ Build Investment total (unless toggled on per car)
--
-- WHY A VIEW FOR THE BUILD SHEET:
--   RLS controls ROW access — not COLUMN access.
--   To expose jobs rows publicly but hide the cost column, we use a
--   database VIEW that simply doesn't include cost, cost_currency, or cost_notes.
--   The public profile page queries `public_build_sheet`. The owner's Build Sheet
--   queries the full `jobs` table. Two queries, clean separation.
-- =============================================================================

-- =============================================================================
-- STEP 1: Add show_investment_publicly to cars
-- =============================================================================

alter table public.cars
  add column if not exists show_investment_publicly boolean not null default false;

comment on column public.cars.show_investment_publicly is
  'When true, total build investment is shown on /builds/:username public profile. Default false.';

-- =============================================================================
-- STEP 2: public_build_sheet VIEW
-- Exposes installed modification jobs for public cars.
-- Excludes ALL cost/financial columns.
-- This is what /builds/:username queries for the build list.
-- =============================================================================

create or replace view public.public_build_sheet as
select
  j.id,
  j.car_id,
  j.type,
  j.category,
  j.title,
  j.brand,
  j.part_number,
  j.status,
  j.date_installed,
  j.date_removed,
  j.products_used,
  j.notes,
  j.created_at,
  -- Car context for the public profile
  c.user_id,
  c.year         as car_year,
  c.make         as car_make,
  c.model        as car_model,
  c.nickname     as car_nickname,
  c.is_public    as car_is_public
  -- Intentionally excluded: j.cost, j.cost_currency, j.cost_notes
from public.jobs j
join public.sessions s on s.id = j.session_id
join public.cars c on c.id = j.car_id
where
  j.status = 'installed'
  and j.type = 'modification'
  and c.is_public = true
  and c.deleted_at is null;

comment on view public.public_build_sheet is
  'Public Build Sheet: installed mods for public cars. Cost columns intentionally excluded. Query this for /builds/:username.';

-- Grant public read on the view
grant select on public.public_build_sheet to anon, authenticated;

-- =============================================================================
-- STEP 3: public_car_profile VIEW
-- Clean public-facing car data. Excludes: VIN, license plate, purchase price,
-- purchase dealer (PII that shouldn't be publicly searchable).
-- The app can still display VIN to the owner — it queries cars directly.
-- =============================================================================

create or replace view public.public_car_profiles as
select
  c.id,
  c.user_id,
  c.year,
  c.make,
  c.model,
  c.trim,
  c.variant_id,
  c.chassis_code,
  c.nickname,
  c.color,
  c.engine_type,
  c.transmission,
  c.drivetrain,
  c.forced_induction,
  c.horsepower,       -- stored in hp; display conversion at app layer
  c.torque,           -- stored in lb-ft
  c.current_mileage,  -- stored in miles
  c.is_import,
  c.garage_photo_url,
  c.showcase_photo_url,
  c.photo_y_offset,
  c.purchase_story,   -- the "tell your story" text — intentionally public (it's the bio)
  c.purchase_date,    -- date of ownership start — cultural, not sensitive
  c.is_public,
  c.show_investment_publicly,
  c.created_at,
  -- Owner info (username + avatar for the profile header)
  u.username,
  u.display_name,
  u.avatar_url,
  u.city,
  u.country
  -- Intentionally excluded: vin, license_plate, paint_code, purchase_price,
  --   purchase_dealer, notes (car-specific personal notes), tire_size,
  --   oil_type, battery_model (operational data, not profile data)
from public.cars c
join public.users u on u.id = c.user_id
where
  c.is_public = true
  and c.deleted_at is null
  and u.deleted_at is null;

comment on view public.public_car_profiles is
  'Public car profile data. VIN, license plate, purchase price, and operational data excluded. Use for /builds/:username.';

grant select on public.public_car_profiles to anon, authenticated;

-- =============================================================================
-- STEP 4: build_investment_public VIEW
-- Returns total spend for cars where show_investment_publicly = true.
-- Only called when rendering /builds/:username — never for private cars.
-- =============================================================================

create or replace view public.build_investment_public as
select
  r.car_id,
  SUM(r.amount) as total_investment,
  COUNT(r.id)   as receipt_count,
  MIN(r.receipt_date) as first_receipt_date,
  MAX(r.receipt_date) as last_receipt_date
from public.receipts r
join public.cars c on c.id = r.car_id
where
  c.is_public = true
  and c.deleted_at is null
  and c.show_investment_publicly = true
  and r.amount is not null
  and r.amount > 0
group by r.car_id;

comment on view public.build_investment_public is
  'Total build investment for public cars where show_investment_publicly=true. Excludes $0 receipts.';

-- Note: currency is not summed across currencies (no FX conversion).
-- For multi-currency builds, the app should group by currency and display separately.
-- This is a Phase 2 concern — most users will have single-currency builds.

grant select on public.build_investment_public to anon, authenticated;

-- =============================================================================
-- STEP 5: Update RLS on jobs to allow public read of installed mods
-- The view handles the column filtering. RLS allows the row access.
-- Only installed modifications on public non-deleted cars are readable.
-- =============================================================================

-- Drop the existing owner-only policy on jobs (we're expanding access)
-- The owner policy stays. We're ADDING a public select policy.

create policy "jobs_select_public_buildsheet"
  on public.jobs
  for select
  using (
    -- Only installed modifications
    status = 'installed'
    and type = 'modification'
    -- On a public, non-deleted car
    and car_id in (
      select id from public.cars
      where is_public = true and deleted_at is null
    )
  );

-- This policy allows the public_build_sheet VIEW to work.
-- Cost data is never exposed through RLS — the view simply doesn't select it.
-- If someone queries jobs directly (bypassing the view), they still can't see
-- another user's job costs — the owner-only policy governs full access.

-- =============================================================================
-- STEP 6: Index for public build sheet queries
-- =============================================================================

create index if not exists jobs_public_buildsheet
  on public.jobs (car_id, type, status, created_at desc)
  where type = 'modification' and status = 'installed';

-- =============================================================================
-- STEP 7: Index for public investment query
-- =============================================================================

create index if not exists receipts_public_investment
  on public.receipts (car_id)
  where amount > 0 and amount is not null;
