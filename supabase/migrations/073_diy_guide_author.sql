-- =============================================================================
-- G-DIMENSION — Migration 073: DIY guide authorship (created_by)
-- =============================================================================
-- Records WHO wrote a DIY install guide, independent of who currently owns the
-- car. Until now authorship was only ever derived transitively via
-- car_id -> cars.user_id, which is exactly what breaks on a car transfer
-- (migration 072 / ADR-017): after a transfer, a guide the previous owner
-- painstakingly wrote reads as if the NEW owner authored it. This column makes
-- the original author explicit so the UI can credit them ("Created by @handle").
--
-- Design notes (see ADR-018):
--   - Nullable FK -> users(id) on delete set null: if the author ever deletes
--     their account, the guide survives (owned via car_id) but loses the credit
--     line rather than cascading away.
--   - Backfill sets created_by = the car's CURRENT owner for every existing
--     guide. That's the only signal available — pre-migration guides carry no
--     real authorship history — so a guide on a car that was ALREADY transferred
--     before this migration will be (incorrectly but unrecoverably) credited to
--     the new owner. Going forward the frontend stamps created_by = auth.uid()
--     at creation, so all new guides are correct.
--   - No new grants/policies: created_by is a column on an existing table, so
--     the table-level grants + RLS from migration 059 already cover it. The
--     column is display-only attribution, not an access-control field — RLS on
--     diy_guides still keys on car_id -> cars.user_id, unchanged.
--
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

alter table public.diy_guides
  add column if not exists created_by uuid references public.users(id) on delete set null;

comment on column public.diy_guides.created_by is
  'The user who authored this guide (migration 073). Independent of the car''s current owner so credit survives a car transfer. NULL = unknown/legacy or author account deleted.';

-- Backfill existing guides to the car's current owner (best available signal).
update public.diy_guides g
set created_by = c.user_id
from public.cars c
where g.car_id = c.id
  and g.created_by is null;

-- FK covering index (066/067 convention) — also serves the creator embed.
create index if not exists diy_guides_created_by on public.diy_guides (created_by);

notify pgrst, 'reload schema';
