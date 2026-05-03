-- =============================================================================
-- G-DIMENSION — Migration 018: vehicle_search_aliases
-- =============================================================================
-- Solves the "Evo vs Evolution" problem and all similar enthusiast shorthand.
-- When a user types "Evo" in the Add Car make/model search, they get results
-- for "Lancer Evolution" — not zero results or wrong results.
--
-- THE PROBLEM THIS SOLVES:
--   Craigslist searches "Evo" and "Evolution" return separate result sets.
--   G-Dimension should treat them as identical.
--   This table maps every known alias/shorthand → canonical make or model name.
--
-- HOW THE SEARCH WORKS:
--   1. User types "Evo" in the model search field
--   2. App queries vehicle_search_aliases WHERE alias ILIKE 'evo%'
--   3. Gets back canonical = 'Lancer Evolution', model_id = [correct ID]
--   4. App also queries vehicle_models directly for 'evo%'
--   5. Combines and deduplicates results
--   6. User sees "Lancer Evolution" suggestions immediately
--
-- ALIAS TYPES:
--   make aliases:    "Mitsu" → "Mitsubishi" (no model_id, just make_id)
--   model aliases:   "Evo" → "Lancer Evolution" (make_id + model_id)
--   chassis aliases: "EK9" → "Civic Type R EK9" (make_id + model_id + variant match)
--
-- MAINTENANCE:
--   This list grows with the community. Add aliases as users report missing ones.
--   Eventually a "suggest an alias" form in the app can feed user_added entries
--   that go through a lightweight review process.
-- =============================================================================

create table if not exists public.vehicle_search_aliases (
  id          serial primary key,
  alias       text not null,          -- What the user types: "Evo", "EK9", "Mitsu"
  canonical   text not null,          -- What it maps to: "Lancer Evolution", "Civic"
  alias_type  text not null
                check (alias_type in ('make','model','variant','chassis'))
                default 'model',

  -- Optional FKs to reference tables (null = alias is purely text-based)
  make_id     integer references public.vehicle_makes(id) on delete cascade,
  model_id    integer references public.vehicle_models(id) on delete cascade,
  variant_id  integer references public.vehicle_variants(id) on delete cascade,

  source      text not null
                check (source in ('curated','user_suggested','carquery'))
                default 'curated',

  created_at  timestamptz not null default now(),

  -- An alias maps to exactly one canonical — prevent duplicates
  constraint vehicle_search_aliases_unique unique (alias, make_id, model_id)
);

comment on table  public.vehicle_search_aliases is 'Search alias layer. Maps enthusiast shorthand (Evo, EK9, Mitsu) to canonical names.';
comment on column public.vehicle_search_aliases.alias is 'What the user types. Always stored lowercase — search is case-insensitive.';
comment on column public.vehicle_search_aliases.canonical is 'The official name this alias resolves to.';
comment on column public.vehicle_search_aliases.alias_type is 'make=manufacturer alias, model=model alias, variant/chassis=sub-model alias.';

-- Case-insensitive index for prefix search (the autocomplete pattern)
create index if not exists vehicle_search_aliases_alias_lower
  on public.vehicle_search_aliases (lower(alias));

create index if not exists vehicle_search_aliases_alias_trgm
  on public.vehicle_search_aliases using gin (lower(alias) gin_trgm_ops);

-- =============================================================================
-- SEED DATA: Curated alias list
-- All aliases stored lowercase — search queries lowercased before matching.
-- =============================================================================

insert into public.vehicle_search_aliases (alias, canonical, alias_type, source)
values

-- ============================================================
-- MAKE ALIASES
-- ============================================================
('mitsu',       'Mitsubishi',   'make', 'curated'),
('chevy',       'Chevrolet',    'make', 'curated'),
('merc',        'Mercedes-Benz','make', 'curated'),
('mercedes',    'Mercedes-Benz','make', 'curated'),
('beamer',      'BMW',          'make', 'curated'),
('bimmer',      'BMW',          'make', 'curated'),
('vw',          'Volkswagen',   'make', 'curated'),
('vw',          'Volkswagen',   'make', 'curated'),
('subie',       'Subaru',       'make', 'curated'),
('scooby',      'Subaru',       'make', 'curated'),
('maz',         'Mazda',        'make', 'curated'),
('porsche',     'Porsche',      'make', 'curated'),   -- common misspelling: 'porche'
('porche',      'Porsche',      'make', 'curated'),

-- ============================================================
-- MODEL ALIASES — Nissan
-- ============================================================
('240sx',       'Silvia',       'model', 'curated'),   -- US market name for S13/S14
('180sx',       '180SX',        'model', 'curated'),
('silvia s13',  'Silvia S13',   'model', 'curated'),
('silvia s14',  'Silvia S14',   'model', 'curated'),
('silvia s15',  'Silvia S15',   'model', 'curated'),
('s13',         'Silvia S13',   'model', 'curated'),
('s14',         'Silvia S14',   'model', 'curated'),
('s14 kouki',   'Silvia S14',   'variant','curated'),
('s14 zenki',   'Silvia S14',   'variant','curated'),
('s15',         'Silvia S15',   'model', 'curated'),
('r32',         'Skyline R32',  'model', 'curated'),
('r33',         'Skyline R33',  'model', 'curated'),
('r34',         'Skyline R34',  'model', 'curated'),
('gtr',         'GT-R',         'model', 'curated'),
('gt-r',        'GT-R',         'model', 'curated'),
('r35',         'GT-R',         'model', 'curated'),
('370z',        '370Z',         'model', 'curated'),
('350z',        '350Z',         'model', 'curated'),
('z33',         '350Z',         'model', 'curated'),
('z34',         '370Z',         'model', 'curated'),
('stagea',      'Stagea',       'model', 'curated'),

-- ============================================================
-- MODEL ALIASES — Toyota
-- ============================================================
('supra mk4',   'Supra',        'model', 'curated'),
('supra a80',   'Supra',        'model', 'curated'),
('a80',         'Supra',        'model', 'curated'),
('jzx100',      'Chaser JZX100','model', 'curated'),
('jzx90',       'Chaser JZX90', 'model', 'curated'),
('chaser',      'Chaser JZX100','model', 'curated'),
('cresta',      'Cresta JZX100','model', 'curated'),
('aristo',      'Aristo JZS161','model', 'curated'),
('jzs161',      'Aristo JZS161','model', 'curated'),
('altezza',     'Altezza',      'model', 'curated'),
('is300',       'Altezza',      'model', 'curated'),   -- Lexus IS300 = Altezza
('soarer',      'Soarer Z30',   'model', 'curated'),
('ae86',        'Corolla AE86', 'model', 'curated'),
('hachi roku',  'Corolla AE86', 'model', 'curated'),
('trueno',      'Corolla AE86', 'model', 'curated'),
('levin',       'Corolla AE86', 'model', 'curated'),
('86',          'GR86',         'model', 'curated'),
('brz',         'BRZ',          'model', 'curated'),   -- not Toyota but cross-listed
('gr86',        'GR86',         'model', 'curated'),
('mark ii',     'Mark II JZX100','model','curated'),
('markii',      'Mark II JZX100','model','curated'),

-- ============================================================
-- MODEL ALIASES — Honda
-- ============================================================
('type r',      'Civic Type R EK9', 'model', 'curated'),   -- generic; context-specific in app
('ek9',         'Civic Type R EK9', 'chassis','curated'),
('ek',          'Civic',            'model', 'curated'),
('eg',          'Civic',            'model', 'curated'),
('ef',          'Civic',            'model', 'curated'),
('dc2',         'Integra',          'chassis','curated'),
('dc5',         'Integra',          'chassis','curated'),
('integra type r','Integra Type R DC2','model','curated'),
('itr',         'Integra Type R DC2','model','curated'),
('ctr',         'Civic Type R EK9', 'model', 'curated'),
('s2000',       'S2000',            'model', 'curated'),
('ap1',         'S2000',            'chassis','curated'),
('ap2',         'S2000',            'chassis','curated'),
('nsx',         'NSX',              'model', 'curated'),
('na1',         'NSX',              'chassis','curated'),
('na2',         'NSX',              'chassis','curated'),

-- ============================================================
-- MODEL ALIASES — Mitsubishi
-- ============================================================
('evo',             'Lancer Evolution',    'model', 'curated'),
('evolution',       'Lancer Evolution',    'model', 'curated'),
('lancer evo',      'Lancer Evolution',    'model', 'curated'),
('lancer evolution','Lancer Evolution',    'model', 'curated'),
('evo iv',          'Lancer Evolution IV', 'model', 'curated'),
('evo v',           'Lancer Evolution V',  'model', 'curated'),
('evo vi',          'Lancer Evolution VI', 'model', 'curated'),
('evo 4',           'Lancer Evolution IV', 'model', 'curated'),
('evo 5',           'Lancer Evolution V',  'model', 'curated'),
('evo 6',           'Lancer Evolution VI', 'model', 'curated'),
('evo vii',         'Lancer Evolution VII','model', 'curated'),
('evo viii',        'Lancer Evolution VIII','model','curated'),
('evo ix',          'Lancer Evolution IX', 'model', 'curated'),
('evo x',           'Lancer Evolution X',  'model', 'curated'),
('evo 7',           'Lancer Evolution VII','model', 'curated'),
('evo 8',           'Lancer Evolution VIII','model','curated'),
('evo 9',           'Lancer Evolution IX', 'model', 'curated'),
('evo 10',          'Lancer Evolution X',  'model', 'curated'),
('cp9a',            'Lancer Evolution VI', 'chassis','curated'),
('ct9a',            'Lancer Evolution VIII','chassis','curated'),
('eclipse',         'Eclipse',             'model', 'curated'),
('gto',             'GTO Twin Turbo',      'model', 'curated'),
('3000gt',          'GTO Twin Turbo',      'model', 'curated'),

-- ============================================================
-- MODEL ALIASES — Mazda
-- ============================================================
('rx7',     'RX-7',      'model', 'curated'),
('rx-7',    'RX-7',      'model', 'curated'),
('fd',      'RX-7 FD3S', 'model', 'curated'),
('fd3s',    'RX-7 FD3S', 'chassis','curated'),
('fc',      'RX-7 FC3S', 'model', 'curated'),
('fc3s',    'RX-7 FC3S', 'chassis','curated'),
('rx8',     'RX-8',      'model', 'curated'),
('rx-8',    'RX-8',      'model', 'curated'),
('miata',   'MX-5',      'model', 'curated'),
('mx5',     'MX-5',      'model', 'curated'),
('mx-5',    'MX-5',      'model', 'curated'),
('roadster','MX-5',      'model', 'curated'),
('nb',      'MX-5',      'chassis','curated'),   -- NA, NB, NC, ND generations
('na',      'MX-5',      'chassis','curated'),
('nc',      'MX-5',      'chassis','curated'),
('nd',      'MX-5',      'chassis','curated'),
('speed3',  'Mazdaspeed3','model','curated'),
('speed6',  'Mazdaspeed6','model','curated'),

-- ============================================================
-- MODEL ALIASES — Subaru
-- ============================================================
('wrx',         'Impreza WRX',       'model', 'curated'),
('sti',         'Impreza WRX STI',   'model', 'curated'),
('wrx sti',     'Impreza WRX STI',   'model', 'curated'),
('gc8',         'Impreza WRX STI GC8','chassis','curated'),
('gdb',         'Impreza WRX STI',   'chassis','curated'),
('gd',          'Impreza WRX STI',   'chassis','curated'),
('legacy gt',   'Legacy B4 BE5',     'model', 'curated'),
('outback',     'Outback',           'model', 'curated'),
('forester xt', 'Forester',          'model', 'curated'),
('baja',        'Baja',              'model', 'curated'),

-- ============================================================
-- MODEL ALIASES — BMW
-- ============================================================
('e30',     'M3',    'chassis','curated'),   -- Specific to M3 context — may be ambiguous
('e36',     '3 Series','chassis','curated'),
('e46',     '3 Series','chassis','curated'),
('e90',     '3 Series','chassis','curated'),
('e92',     '3 Series','chassis','curated'),
('f30',     '3 Series','chassis','curated'),
('e39',     '5 Series','chassis','curated'),
('e60',     '5 Series','chassis','curated'),

-- ============================================================
-- MODEL ALIASES — Volkswagen
-- ============================================================
('gti',     'Golf GTI',   'model', 'curated'),
('golf r',  'Golf R',     'model', 'curated'),
('jetta gli','Jetta GLI', 'model', 'curated'),
('mk4',     'Golf',       'chassis','curated'),
('mk5',     'Golf',       'chassis','curated'),
('mk6',     'Golf',       'chassis','curated'),
('mk7',     'Golf',       'chassis','curated'),
('r32',     'Golf R32',   'model', 'curated'),   -- Note: same as Skyline R32 — context resolves
('scirocco','Scirocco',   'model', 'curated'),

-- ============================================================
-- MODEL ALIASES — Domestic US
-- ============================================================
('mustang gt',   'Mustang',    'model', 'curated'),
('mustang gt500','Mustang',    'model', 'curated'),
('camaro ss',    'Camaro',     'model', 'curated'),
('corvette',     'Corvette',   'model', 'curated'),
('c5',           'Corvette',   'chassis','curated'),
('c6',           'Corvette',   'chassis','curated'),
('c7',           'Corvette',   'chassis','curated'),
('c8',           'Corvette',   'chassis','curated'),
('charger srt',  'Charger',    'model', 'curated'),
('challenger srt','Challenger','model', 'curated'),
('viper',        'Viper',      'model', 'curated'),
('ram 1500',     'Ram 1500',   'model', 'curated'),
('f150',         'F-150',      'model', 'curated'),
('raptor',       'F-150',      'model', 'curated')

on conflict (alias, make_id, model_id) do nothing;

-- No RLS — reference data, public read
grant select on public.vehicle_search_aliases to anon, authenticated;
