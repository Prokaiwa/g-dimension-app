-- =============================================================================
-- G-DIMENSION — Migration 072: Car ownership transfer (offer → accept)
-- =============================================================================
-- Lets an owner hand a car — with its FULL history (mods, sessions, timeline,
-- service records, DIY guides, documents, receipts, photos) — to another
-- G-Dimension user, e.g. when selling the car. "The build history goes with
-- the car." Always an OFFER → ACCEPT flow: the recipient consents; there is
-- no one-sided push. See ADR-017.
--
-- Why the swap is an RPC and not client updates: cars.user_id is THE ownership
-- column — every child table keys on car_id with 1-hop RLS through cars, so
-- flipping cars.user_id transfers the whole history for free. But three things
-- do NOT follow automatically and must change atomically, across RLS
-- boundaries no single client is allowed to cross:
--   1. car_private.user_id — its RLS keys on user_id, not car ownership; if
--      only cars.user_id changed, the new owner would be locked out of the VIN.
--   2. The old owner's users.active_car_id would dangle at a car they no
--      longer own (the FK is `on delete set null` — transfers don't delete).
--   3. The seller's private financials (license plate, purchase price/dealer/
--      mileage-at-purchase) must be wiped, not handed to the buyer. The VIN is
--      car-intrinsic and transfers; purchase_story/purchase_date stay on cars
--      (public origin history — the story goes with the car).
-- Hence accept_car_transfer(): SECURITY DEFINER, one transaction, re-validates
-- everything server-side. This is the schema's first PostgREST-exposed RPC and
-- car_transfers is its first two-party RLS table.
--
-- Storage note (deliberate, ADR-017): photo files stay physically under the
-- OLD owner's `{userId}/{carId}/…` prefix. DB rows store full public URLs (or
-- bucket paths for private buckets), so everything keeps rendering. The
-- delete-account edge function is patched in the same commit to skip car
-- folders whose car now belongs to someone else.
--
-- Offers expire 14 days after creation (expires_at). Expiry is enforced at
-- read time (UI filters) and at accept time (RPC rejects) — no cron job.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- ── car_transfers ──
create table if not exists public.car_transfers (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid not null references public.cars(id)  on delete cascade,
  from_user_id  uuid not null references public.users(id) on delete cascade,
  to_user_id    uuid not null references public.users(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending','accepted','declined','cancelled')),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '14 days',
  responded_at  timestamptz,
  check (from_user_id <> to_user_id)
);

comment on table public.car_transfers is
  'Car ownership transfer offers (offer → accept, ADR-017). Two-party rows: sender (from_user_id) and recipient (to_user_id) can both read; accept happens ONLY via the accept_car_transfer() RPC.';

-- One live offer per car (the 23505 from this index is surfaced as a friendly
-- "a transfer is already pending" message in src/lib/carTransfers.ts).
create unique index if not exists car_transfers_one_pending
  on public.car_transfers (car_id) where status = 'pending';

-- Recipient inbox probe (Garage mount query).
create index if not exists car_transfers_to_pending
  on public.car_transfers (to_user_id) where status = 'pending';

-- FK covering indexes (067 convention — from_user_id lookups + cascade paths).
create index if not exists car_transfers_from_user on public.car_transfers (from_user_id);

-- ── RLS ──
-- Two-party table: both sender and recipient may read their rows. State
-- transitions via plain UPDATE are limited to cancel (sender) and decline
-- (recipient); 'accepted' is not writable by any policy — RPC only. The
-- column-level UPDATE grant below is what stops a party from rewriting
-- car_id/to_user_id on update (WITH CHECK cannot reference the old row).
alter table public.car_transfers enable row level security;

drop policy if exists "car_transfers_select_parties" on public.car_transfers;
create policy "car_transfers_select_parties" on public.car_transfers
  for select
  using ((select auth.uid()) = from_user_id or (select auth.uid()) = to_user_id);

drop policy if exists "car_transfers_insert_sender" on public.car_transfers;
create policy "car_transfers_insert_sender" on public.car_transfers
  for insert
  with check (
    (select auth.uid()) = from_user_id
    and status = 'pending'
    and exists (select 1 from public.cars c
                where c.id = car_transfers.car_id
                  and c.user_id = (select auth.uid())
                  and c.deleted_at is null)
  );

drop policy if exists "car_transfers_update_sender_cancel" on public.car_transfers;
create policy "car_transfers_update_sender_cancel" on public.car_transfers
  for update
  using ((select auth.uid()) = from_user_id and status = 'pending')
  with check (status = 'cancelled');

drop policy if exists "car_transfers_update_recipient_decline" on public.car_transfers;
create policy "car_transfers_update_recipient_decline" on public.car_transfers
  for update
  using ((select auth.uid()) = to_user_id and status = 'pending')
  with check (status = 'declined');

-- ── Grants (required for tables created after 2026-05-30; no anon — private) ──
grant select, insert on public.car_transfers to authenticated;
grant update (status, responded_at) on public.car_transfers to authenticated;

-- ── The ownership swap ──
-- SECURITY DEFINER: crosses three RLS boundaries no client may cross in one
-- transaction (cars owner-write as the OLD owner, car_private keyed on the old
-- owner's user_id, the old owner's users row). auth.uid() is re-checked inside
-- because DEFINER bypasses RLS entirely.
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
end;
$$;

-- First PostgREST-exposed RPC: establish the EXECUTE hygiene pattern (mirrors
-- the 2026-05-31 trigger-function lockdown in hotfixes.sql). Note CREATE OR
-- REPLACE preserves existing grants on re-run, so revoke/grant explicitly.
revoke execute on function public.accept_car_transfer(uuid) from public;
revoke execute on function public.accept_car_transfer(uuid) from anon;
grant execute on function public.accept_car_transfer(uuid) to authenticated;

notify pgrst, 'reload schema';
