-- =============================================================================
-- G-DIMENSION — Migration 043: drop the orphaned car_contacts table
-- =============================================================================
-- car_contacts (per-car contact book, migration 010) was superseded by
-- user_contacts (per-user, migration 035). The app no longer references
-- car_contacts anywhere except a single explanatory comment — confirmed via
-- code search — and the table holds 0 rows.
--
-- Removing it now that nothing depends on it. CASCADE also drops its RLS
-- policies and grants. If you'd rather keep it as historical scaffolding,
-- skip this migration — nothing else depends on it either way.
-- =============================================================================

drop table if exists public.car_contacts cascade;
