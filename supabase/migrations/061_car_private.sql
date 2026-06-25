-- 061_car_private.sql
-- Move owner-only sensitive fields OUT of public.cars into public.car_private.
--
-- Why: the cars table has a public-read RLS policy (cars_select_public: is_public
-- = true), and RLS is row-level, not column-level — so that policy exposed EVERY
-- column of any public car, including VIN, license plate, and purchase price, to
-- the public anon key. is_public defaults to true, so this was effectively every
-- car in the database. The public_car_profiles view already curates safe columns,
-- but the base table stayed readable. Splitting the sensitive columns into an
-- owner-only table (no public policy) closes the hole at the DB layer for good,
-- and avoids the column-privilege footgun (per-column REVOKE silently breaks
-- every future cars column added without an explicit grant).
--
-- Kept in cars (intentionally public / not sensitive): paint_code, purchase_date,
-- purchase_story (the public bio) — see the public_car_profiles view (023).
--
-- Idempotent. Run in the Supabase SQL editor.

create table if not exists public.car_private (
  car_id              uuid primary key references public.cars(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  vin                 text,
  license_plate       text,
  purchase_price      decimal(10,2),
  purchase_currency   char(3) default 'USD',  -- ISO 4217
  mileage_at_purchase integer,                -- stored in miles
  purchase_dealer     text,
  created_at          timestamptz not null default now()
);

comment on table public.car_private is
  'Owner-only sensitive car fields (VIN, plate, purchase price/dealer/mileage). Split out of public.cars so the public-read policy on cars cannot expose them. No public RLS policy — never exposed via /builds/:username.';

-- Owner-only access. No anon/public policy by design.
alter table public.car_private enable row level security;

drop policy if exists "car_private_all_owner" on public.car_private;
create policy "car_private_all_owner"
  on public.car_private
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- PostgREST grants (no anon — private table).
grant select, insert, update, delete on public.car_private to authenticated;

-- Backfill from existing cars rows (one-time; safe to re-run).
insert into public.car_private (car_id, user_id, vin, license_plate, purchase_price, purchase_currency, mileage_at_purchase, purchase_dealer)
select id, user_id, vin, license_plate, purchase_price, purchase_currency, mileage_at_purchase, purchase_dealer
from public.cars
on conflict (car_id) do nothing;

-- Drop the now-relocated columns from cars so the public policy can never leak
-- them. No view/function/trigger/index references these (verified), so the drop
-- is dependency-free.
alter table public.cars drop column if exists vin;
alter table public.cars drop column if exists license_plate;
alter table public.cars drop column if exists purchase_price;
alter table public.cars drop column if exists purchase_currency;
alter table public.cars drop column if exists mileage_at_purchase;
alter table public.cars drop column if exists purchase_dealer;

notify pgrst, 'reload schema';
