-- =============================================================================
-- G-DIMENSION — Migration 002: vehicle_makes
-- =============================================================================
-- Reference table for vehicle manufacturers. Seeded from NHTSA API (US data)
-- and supplemented with a curated JDM list for Japan-domestic-only makes
-- (see scripts/import_nhtsa.js).
--
-- Serial integer PK is intentional — this is pure reference data, never
-- user-created. The make name in cars.* is still stored as free text for
-- maximum flexibility (Part 24). make_id is an optional FK for price
-- aggregation and marketplace provenance when the user selects from autocomplete.
--
-- source column tracks data provenance:
--   nhtsa       = US NHTSA API
--   carquery    = CarQuery global API
--   jdm_manual  = Japan-domestic curated list
--   eu_manual   = European market curated list
--   user_added  = Community-submitted (admin review required)
--
-- regions array allows a make to be tagged for multiple markets.
-- nhtsa_make_id stores the original NHTSA integer for idempotent re-imports.
-- =============================================================================

-- =============================================================================
-- EXTENSIONS — must come before any index that uses them
-- =============================================================================

-- pg_trgm: enables trigram-based fuzzy search (gin_trgm_ops index below)
-- Used for vehicle make/model autocomplete in the Add Car form
create extension if not exists pg_trgm;

-- =============================================================================
-- TABLE
-- =============================================================================

create table if not exists public.vehicle_makes (
  id            serial primary key,
  make_name     text not null,
  country       text,                    -- ISO 3166-1 alpha-2: US, JP, DE, KR, etc.
  regions       text[] default '{}',     -- Markets: ['US'], ['JP'], ['US','JP'], etc.
  source        text not null
                  check (source in ('nhtsa','carquery','jdm_manual','eu_manual','user_added'))
                  default 'nhtsa',
  nhtsa_make_id integer,                 -- Original NHTSA integer ID (null for manual entries)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),

  constraint vehicle_makes_name_unique unique (make_name)
);

comment on table  public.vehicle_makes is 'Vehicle manufacturer reference data. Seeded from NHTSA + CarQuery + JDM manual list.';
comment on column public.vehicle_makes.source is 'Data origin: nhtsa, carquery, jdm_manual, eu_manual, or user_added.';
comment on column public.vehicle_makes.regions is 'Market regions. Used for regional filtering in future marketplace.';
comment on column public.vehicle_makes.nhtsa_make_id is 'NHTSA integer Make_ID. Used for idempotent re-imports.';

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Fuzzy autocomplete: "Nis" → "Nissan", "merc" → "Mercedes-Benz"
-- Requires pg_trgm (enabled above)
create index if not exists vehicle_makes_name_trgm
  on public.vehicle_makes using gin (make_name gin_trgm_ops);

-- NHTSA import deduplication
create index if not exists vehicle_makes_nhtsa_id
  on public.vehicle_makes (nhtsa_make_id)
  where nhtsa_make_id is not null;

-- No RLS — public read, service role writes only (import scripts)
