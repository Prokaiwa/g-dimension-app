-- =============================================================================
-- G-DIMENSION — Migration 003: vehicle_models
-- =============================================================================
-- Reference table for vehicle models, linked to vehicle_makes. Seeded from
-- NHTSA API and supplemented with JDM-only models not available in NHTSA.
--
-- DESIGN DECISIONS:
--   - year_start / year_end allow range-based year filtering in the Add Car
--     autocomplete. A 1994 Nissan Silvia Q's correctly suggests the S14 era.
--   - `body_style` is optional but forward-looking — useful for the marketplace
--     and price aggregator (a sedan and a coupe with the same model name are
--     different products in the market).
--   - `is_jdm_only` flag surfaces models that were never sold outside Japan.
--     This drives UI logic: "import" badge on car cards, PS display default.
--   - UNIQUE constraint on (make_id, model_name) prevents import duplicates.
--     year_start is excluded from the uniqueness key because the same model
--     name spans multiple generations in NHTSA data.
--
-- FORWARD-LOOKING: When the price aggregator launches, this table becomes the
-- canonical parts catalog anchor. Price data will join on make + model + year.
-- =============================================================================

create table if not exists public.vehicle_models (
  id            serial primary key,
  make_id       integer not null references public.vehicle_makes(id) on delete cascade,
  model_name    text not null,
  year_start    integer,                 -- First model year (e.g. 1989 for R32 Skyline)
  year_end      integer,                 -- Last model year (null = still in production)
  body_style    text,                    -- sedan, coupe, hatchback, wagon, suv, truck, van, convertible, other
  is_jdm_only   boolean not null default false,  -- Never officially sold outside Japan
  source        text not null
                  check (source in ('nhtsa','carquery','jdm_manual','eu_manual','user_added'))
                  default 'nhtsa',
  created_at    timestamptz not null default now(),

  -- Prevent duplicate model names per make
  -- Note: A model may have multiple entries if it spans very different eras
  -- and the NHTSA data splits them — use year_start as tiebreaker in that case
  constraint vehicle_models_make_model_unique unique (make_id, model_name)
);

comment on table  public.vehicle_models is 'Vehicle model reference data linked to makes. Seeded from NHTSA + JDM manual list.';
comment on column public.vehicle_models.is_jdm_only is 'True for models like R32 Skyline GT-R never officially sold outside Japan.';
comment on column public.vehicle_models.year_start is 'First production year. Used to filter suggestions in Add Car year+make+model flow.';
comment on column public.vehicle_models.body_style is 'Optional. Used by future marketplace and price aggregator for product differentiation.';

-- Index for autocomplete: find all models for a given make
create index if not exists vehicle_models_make_id
  on public.vehicle_models (make_id);

-- Trigram index for fuzzy model name search
create index if not exists vehicle_models_name_trgm
  on public.vehicle_models using gin (model_name gin_trgm_ops);

-- Index for JDM-only filter
create index if not exists vehicle_models_jdm_only
  on public.vehicle_models (is_jdm_only)
  where is_jdm_only = true;

-- No RLS on reference tables
