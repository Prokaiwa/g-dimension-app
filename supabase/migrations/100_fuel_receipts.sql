-- 100_fuel_receipts.sql
-- A fill-up is a cost, so it gets receipts like every other cost.
--
-- WHY THE EXISTING TABLE AND NOT A NEW ONE. `receipts` already owns this: the
-- PRIVATE storage bucket, the signed-URL rule, the owner-only RLS, the account
-- data export. A `fuel_entry_photos` table beside it would be a second answer to
-- a question already answered, and the export would quietly miss half the
-- receipts a user has.
--
-- WHAT HAD TO CHANGE. `receipts.session_id` was NOT NULL and a fill-up is not a
-- session — it has no jobs, no shop, no timeline entry, and manufacturing one
-- per tank would put a phantom row in Maintenance every ten days. So the column
-- becomes nullable and `fuel_entry_id` joins it, with a CHECK that exactly one
-- parent is set. That is the same shape `job_id` already had, one level up.
--
-- CASCADE, not SET NULL. `job_id` is `on delete set null` because a receipt for
-- a removed part still belongs to its session. A receipt has no meaning without
-- a fill-up and the CHECK would reject the orphan anyway, so the row goes with
-- it. The app deletes the storage OBJECTS before deleting the entry; the cascade
-- only cleans up the rows.
--
-- Idempotent. Run in the Supabase SQL Editor.


-- =============================================================================
-- 1. The second parent
-- =============================================================================

alter table public.receipts alter column session_id drop not null;

alter table public.receipts
  add column if not exists fuel_entry_id uuid references public.fuel_entries(id) on delete cascade;

comment on column public.receipts.session_id is
  'NULL when this receipt belongs to a fuel_entry instead. Exactly one of session_id / fuel_entry_id is set (receipts_one_parent).';
comment on column public.receipts.fuel_entry_id is
  'A fill-up receipt (migration 100). Cascades: a receipt has no meaning without its fill-up, and the one-parent CHECK would reject the orphan.';

-- Exactly one parent, enforced rather than assumed. Written as XOR so it also
-- rejects a row carrying BOTH, which would make car_id ambiguous below.
alter table public.receipts drop constraint if exists receipts_one_parent;
alter table public.receipts add constraint receipts_one_parent
  check ((session_id is not null) <> (fuel_entry_id is not null));

create index if not exists receipts_fuel_entry_id
  on public.receipts (fuel_entry_id)
  where fuel_entry_id is not null;


-- =============================================================================
-- 2. The car_id trigger learns the second parent
-- =============================================================================
-- car_id is denormalised onto every receipt and it is what the RLS policy reads
-- (`receipts_all_owner` joins cars on receipts.car_id, migration 015). So this
-- trigger is not a convenience — it is the thing that makes the row reachable by
-- its owner and nobody else, and it must never leave car_id null.
--
-- Still `security definer`, still `set search_path = public`, and EXECUTE stays
-- revoked from public (hotfixes.sql, 2026-06-01).

create or replace function public.receipts_set_car_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is not null then
    select car_id into new.car_id
    from public.sessions
    where id = new.session_id;

    if new.car_id is null then
      raise exception 'receipts: session % not found or has no car_id', new.session_id;
    end if;

  elsif new.fuel_entry_id is not null then
    select car_id into new.car_id
    from public.fuel_entries
    where id = new.fuel_entry_id;

    if new.car_id is null then
      raise exception 'receipts: fuel entry % not found', new.fuel_entry_id;
    end if;

  else
    -- Unreachable while receipts_one_parent holds; kept so a future migration
    -- that relaxes the CHECK cannot silently produce car_id-null rows, which
    -- RLS would then hide from everyone including their owner.
    raise exception 'receipts: needs either a session_id or a fuel_entry_id';
  end if;

  return new;
end;
$$;

revoke execute on function public.receipts_set_car_id() from public;

-- The trigger itself is unchanged (BEFORE INSERT, per row) and still points at
-- this function by name, so replacing the body is the whole change.
