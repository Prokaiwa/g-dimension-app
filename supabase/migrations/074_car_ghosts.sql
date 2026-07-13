-- =============================================================================
-- G-DIMENSION — Migration 074: "SOLD" ghost cars (seller's keepsake)
-- =============================================================================
-- Car transfer (072) does a clean handoff: accept_car_transfer flips
-- cars.user_id to the buyer, so the seller loses the car entirely — it vanishes
-- from their garage. This migration keeps a read-only "ghost" of a sold car in
-- the SELLER's world: a frozen identity snapshot ("the car as you knew it"),
-- stamped SOLD, with a link to the new owner's evolving build. See ADR-019.
--
-- Why a dedicated table (not columns on car_transfers):
--   - Durability. car_transfers.car_id is `on delete cascade`, so if the buyer
--     ever hard-deletes the car (7-day soft-delete → nightly purge) the sale
--     row — and any snapshot on it — would vanish. car_ghosts.car_id is
--     `on delete set null`, so the keepsake OUTLIVES the car.
--   - No FK surgery on the live car_transfers table, and a clean separation of
--     "seller's sale ledger" from "transfer offers."
--
-- The ghost is written at accept time INSIDE accept_car_transfer (the one place
-- that runs SECURITY DEFINER and can read the car around the ownership swap).
-- The seller reads/archives their ghosts via owner RLS; the public profile
-- reads them through the public_sold_cars definer view (never the base table).
--
-- New table + view created after 2026-05-30 → explicit PostgREST grants.
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- ── car_ghosts ──
create table if not exists public.car_ghosts (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable + on delete set null: the keepsake survives the buyer deleting the car.
  car_id       uuid references public.cars(id)  on delete set null,
  seller_id    uuid not null references public.users(id) on delete cascade,   -- the ghost's owner (A)
  buyer_id     uuid references public.users(id) on delete set null,           -- the new owner (B)
  sold_at      timestamptz not null default now(),
  archived_at  timestamptz,                                                    -- null = shown; set = archived/hidden
  -- Frozen identity snapshot, captured at sale time.
  snapshot_year      integer,
  snapshot_make      text,
  snapshot_model     text,
  snapshot_variant   text,
  snapshot_trim      text,
  snapshot_nickname  text,
  snapshot_color     text,
  snapshot_photo_url text,
  created_at   timestamptz not null default now()
);

comment on table public.car_ghosts is
  'Read-only keepsake of a car the seller transferred away (ADR-019). Frozen identity snapshot + link to the new owner. Owner-only RLS; public display via the public_sold_cars view. car_id is on delete set null so the ghost outlives the car.';

-- Seller's active-ghost list (private carousel) + FK covering index.
create index if not exists car_ghosts_seller on public.car_ghosts (seller_id) where archived_at is null;
create index if not exists car_ghosts_car    on public.car_ghosts (car_id);
create index if not exists car_ghosts_buyer  on public.car_ghosts (buyer_id);

-- ── RLS ──
-- Seller-only. No anon on the base table — public display goes through the
-- public_sold_cars view. Inserts happen ONLY inside accept_car_transfer
-- (SECURITY DEFINER), so there is deliberately no insert grant/policy for
-- authenticated — consent/authorship is structural, like the accept itself.
alter table public.car_ghosts enable row level security;

drop policy if exists "car_ghosts_all_seller" on public.car_ghosts;
create policy "car_ghosts_all_seller" on public.car_ghosts
  for all
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

-- Grants: seller reads their ghosts; the only client write is archive/unarchive.
grant select on public.car_ghosts to authenticated;
grant update (archived_at) on public.car_ghosts to authenticated;

-- ── Public read gateway (definer view — like public_car_profiles; never security_invoker) ──
create or replace view public.public_sold_cars as
select
  gh.id, gh.car_id, gh.sold_at,
  gh.snapshot_year, gh.snapshot_make, gh.snapshot_model, gh.snapshot_variant,
  gh.snapshot_trim, gh.snapshot_nickname, gh.snapshot_color, gh.snapshot_photo_url,
  seller.username    as seller_username,
  buyer.username     as buyer_username,
  buyer.display_name as buyer_display_name
from public.car_ghosts gh
join public.users seller on seller.id = gh.seller_id
left join public.users buyer on buyer.id = gh.buyer_id
where gh.archived_at is null;

grant select on public.public_sold_cars to anon, authenticated;

-- ── accept_car_transfer: same as 072, plus the ghost insert (step 6) ──
create or replace function public.accept_car_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.car_transfers%rowtype;
  v_caller   uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the offer row so a concurrent accept/cancel serializes here.
  select * into v_transfer
  from public.car_transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'transfer not found';
  end if;
  if v_transfer.to_user_id <> v_caller then
    raise exception 'only the recipient can accept a transfer';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'transfer is no longer pending';
  end if;
  if v_transfer.expires_at <= now() then
    raise exception 'transfer offer has expired';
  end if;

  -- Re-validate the car at accept time: it must still exist, still belong to
  -- the sender, and not be soft-deleted. Lock it so the swap can't race a
  -- concurrent edit/remove.
  perform 1 from public.cars
  where id = v_transfer.car_id
    and user_id = v_transfer.from_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'car is no longer available for transfer';
  end if;

  -- 1. The ownership column — every child table follows via car_id RLS.
  update public.cars
  set user_id = v_transfer.to_user_id
  where id = v_transfer.car_id;

  -- 2. car_private: re-key to the new owner (RLS is on user_id) and wipe the
  --    seller's private financials/registration. VIN is car-intrinsic — kept.
  update public.car_private
  set user_id             = v_transfer.to_user_id,
      license_plate       = null,
      purchase_price      = null,
      purchase_currency   = 'USD',
      purchase_dealer     = null,
      mileage_at_purchase = null
  where car_id = v_transfer.car_id;

  -- 3. The old owner's active-car pointer, if it aimed at this car.
  update public.users
  set active_car_id = null
  where id = v_transfer.from_user_id
    and active_car_id = v_transfer.car_id;

  -- 4. Close the offer.
  update public.car_transfers
  set status = 'accepted', responded_at = now()
  where id = p_transfer_id;

  -- 5. Belt-and-suspenders: cancel any other pending offers on this car (the
  --    partial unique index should make this a no-op).
  update public.car_transfers
  set status = 'cancelled', responded_at = now()
  where car_id = v_transfer.car_id
    and status = 'pending'
    and id <> p_transfer_id;

  -- 6. The seller's keepsake: a frozen snapshot of the car as they knew it,
  --    shown as a "SOLD" ghost in their garage. Read from the car directly
  --    (DEFINER — the ownership swap above doesn't hide it here).
  insert into public.car_ghosts
    (car_id, seller_id, buyer_id, snapshot_year, snapshot_make, snapshot_model,
     snapshot_variant, snapshot_trim, snapshot_nickname, snapshot_color, snapshot_photo_url)
  select v_transfer.car_id, v_transfer.from_user_id, v_transfer.to_user_id,
         c.year, c.make, c.model, c.variant, c.trim, c.nickname, c.color, c.garage_photo_url
  from public.cars c
  where c.id = v_transfer.car_id;
end;
$$;

-- CREATE OR REPLACE preserves grants, but mirror 072's explicit hygiene.
revoke execute on function public.accept_car_transfer(uuid) from public;
revoke execute on function public.accept_car_transfer(uuid) from anon;
grant execute on function public.accept_car_transfer(uuid) to authenticated;

-- ── Backfill: give already-accepted transfers a ghost (snapshot from the live
--    car, the only signal available for historical sales). ──
insert into public.car_ghosts
  (car_id, seller_id, buyer_id, sold_at, snapshot_year, snapshot_make, snapshot_model,
   snapshot_variant, snapshot_trim, snapshot_nickname, snapshot_color, snapshot_photo_url)
select t.car_id, t.from_user_id, t.to_user_id, coalesce(t.responded_at, now()),
       c.year, c.make, c.model, c.variant, c.trim, c.nickname, c.color, c.garage_photo_url
from public.car_transfers t
join public.cars c on c.id = t.car_id
where t.status = 'accepted'
  and not exists (
    select 1 from public.car_ghosts g
    where g.car_id = t.car_id and g.seller_id = t.from_user_id
  );

notify pgrst, 'reload schema';
