# G-DIMENSION — Architecture Addendum v1.0
## Supplements MASTER_ARCHITECTURE.md v2.5
## All items here supersede or extend the master file where they conflict.

---

## HOW TO USE THIS FILE

This addendum documents every decision made during the Supabase setup sessions
that is not yet reflected in MASTER_ARCHITECTURE.md v2.5. When the master file
is next updated (target: before Claude Code begins Step 5 — Auth screens),
every section below should be merged into the appropriate Part.

**Priority:** This addendum supersedes v2.5 on all points of conflict.

---

## UPDATES TO PART 17 — DATA MODEL

### Complete Table List (replaces the v2.5 table inventory)

The following tables exist that are NOT in v2.5:

#### `vehicle_variants` (new — migration 017)
Sub-model / chassis code layer. Sits between `vehicle_models` and `cars`.

```sql
create table vehicle_variants (
  id            serial primary key,
  model_id      integer references vehicle_models(id) on delete cascade,
  variant_name  text not null,      -- "S14 Kouki", "Type R", "Spec-R", "GT-R V-Spec II"
  chassis_code  text,               -- "S14", "EK9", "BNR34"
  trim_level    text,
  year_start    integer,
  year_end      integer,
  engine_code   text,               -- "SR20DET", "B16B", "RB26DETT"
  engine_cc     integer,
  power_hp      integer,            -- stored in hp (base unit)
  torque_lbft   integer,            -- stored in lb-ft (base unit)
  drive         text,               -- rwd/fwd/awd/4wd
  body_style    text,
  is_jdm_only   boolean,
  source        text                -- carquery/jdm_manual/nhtsa/eu_manual/user_added
);
```

**Cars table additions:**
```sql
cars.variant_id    integer references vehicle_variants(id) on delete set null
cars.chassis_code  text   -- free-text fallback when variant not in DB
```

#### `vehicle_search_aliases` (new — migration 018)
Maps enthusiast shorthand to canonical names.

```sql
create table vehicle_search_aliases (
  id          serial primary key,
  alias       text not null,      -- stored lowercase: "evo", "ek9", "s14 kouki"
  canonical   text not null,
  alias_type  text,               -- make/model/variant/chassis
  make_id     integer references vehicle_makes(id),
  model_id    integer references vehicle_models(id),
  variant_id  integer references vehicle_variants(id),
  source      text                -- curated/user_suggested/carquery
);
```

**Search query pattern:**
```sql
-- User types "evo" → search aliases first, then models
SELECT DISTINCT canonical, model_id FROM vehicle_search_aliases
WHERE lower(alias) LIKE lower($1) || '%'
UNION
SELECT model_name, id FROM vehicle_models
WHERE lower(model_name) LIKE lower($1) || '%'
LIMIT 10;
```

#### `user_flags` (new — migration 019)
Per-user feature flags for staged rollouts.

```sql
create table user_flags (
  user_id     uuid references users(id),
  flag        text not null,
  enabled     boolean default true,
  granted_by  uuid references users(id),
  expires_at  timestamptz,
  primary key (user_id, flag)
);
```

**Planned flags:**
- `beta_marketplace` — marketplace early access
- `price_aggregator` — market price display on jobs
- `api_access` — API product users
- `pro_trial` — 30-day Pro trial
- `carquery_variants` — variant picker beta

#### `audit_log` (new — migration 019)
Immutable change history for cars, jobs, sessions, timeline_entries.

```sql
create table audit_log (
  id          uuid primary key,
  user_id     uuid references users(id) on delete set null,
  table_name  text,
  row_id      uuid,
  operation   text,   -- UPDATE or DELETE
  old_data    jsonb,
  new_data    jsonb,
  changed_at  timestamptz
);
```

#### `notification_preferences` (new — migration 019)
Push notification settings per user per device.

```sql
create table notification_preferences (
  id                  uuid primary key,
  user_id             uuid references users(id),
  reminders_enabled   boolean default true,
  milestones_enabled  boolean default true,
  marketing_enabled   boolean default false,
  digest_enabled      boolean default false,
  push_token          text,
  push_platform       text,   -- ios/android/web
  token_active        boolean default true
);
```

### Updated `jobs` Table (replaces v2.5 definition)

New columns:
```sql
car_id       uuid references cars(id) on delete cascade  -- NULLABLE
             -- Anchors Blueprint/Parts Bin jobs with no session
             -- Auto-derived from session chain via trigger when session_id is set
             -- Required when session_id is null (enforced by constraint)

still_owned  boolean default false
             -- When removing an installed part: did the user keep it?
             -- true → trigger auto-creates a new 'purchased' job (Parts Bin entry)
             -- false → part is gone (status = sold or scrapped)

cost_notes   text
             -- "free from friend", "sponsored", "warranty replacement"
             -- ANY non-null value → job excluded from price aggregation

cost_currency char(3) default 'USD'
             -- ISO 4217. JPY for JDM parts, EUR for EU builds.
```

**New constraint:**
```sql
constraint jobs_must_have_car_anchor check (
  session_id is not null or car_id is not null
)
```

**New triggers:**
1. `jobs_auto_car_id` — populates car_id from session chain on every INSERT
2. `jobs_removal_to_parts_bin` — when status → removed AND still_owned = true,
   auto-creates a new 'purchased' job row (the part reappears in Parts Bin)

### Updated `cars` Table additions

```sql
cars.show_investment_publicly  boolean default false
-- When true, total build investment shown on /builds/:username
-- Default false — user opts in explicitly

cars.is_import    boolean default false
-- JDM/EU import flag. Surfaces import badge in UI.
-- Affects marketplace provenance display.

cars.purchase_currency  char(3) default 'USD'
-- ISO 4217. Use JPY for JDM imports, EUR for EU imports.
-- Forward-looking for multi-currency build tracking.

cars.variant_id   integer references vehicle_variants(id)
-- Links to sub-model detail (chassis code, engine, specs)

cars.chassis_code text
-- Free-text fallback when variant not in database
-- Auto-populated from vehicle_variants.chassis_code when variant_id set
```

### New Database Views (migration 023)

**`public_build_sheet`** — Public Build Sheet for /builds/:username
- Installed modifications on public cars
- Excludes: `cost`, `cost_currency`, `cost_notes`
- App queries this view for the public profile build list

**`public_car_profiles`** — Clean public car data
- Excludes: `vin`, `license_plate`, `purchase_price`, `purchase_dealer`
- Includes: purchase_story (the user-written narrative — intentionally public)

**`build_investment_public`** — Total spend for public cars
- Only returns data where `cars.show_investment_publicly = true`
- Excludes $0 receipts
- Does not convert across currencies (multi-currency handled at app layer)

---

## UPDATES TO PART 16 — USER PREFERENCES & UNIT SYSTEM

No changes to the unit system itself. One addendum:

**280 PS storage clarification:**
PS is a display unit only. Factory specs stored as HP (e.g., the R32 GT-R's factory
276 HP is stored as `276` in `cars.horsepower`). When displayed in PS mode:
```
HP ÷ 0.9863 = PS
276 ÷ 0.9863 = 279.8 PS → displayed as "280 PS"
```
This is exactly the culturally significant 280 PS gentleman's agreement figure.

---

## UPDATES TO PART 24 — VEHICLE DATABASE

### Dual Import Strategy (replaces single NHTSA entry)

**Two import scripts:**

| Script | Source | Coverage | Cost | Run When |
|---|---|---|---|---|
| `scripts/import_nhtsa.js` | NHTSA API | US market + curated JDM | Free | During initial setup (Step 4) |
| `scripts/import_carquery.js` | CarQuery API | Global, all eras, trims/variants | ~$9/month | At first revenue or immediately with commercial key |

**Import sequence (must run in this order):**
1. Supabase migrations (001 → 023)
2. `node scripts/import_nhtsa.js` — US data + JDM seed
3. `node scripts/import_carquery.js` — global enrichment
4. Verify with SQL queries (see script output for verification queries)

**Conflict resolution:**
Both scripts normalize make/model names to Title Case before any DB operation.
`"NISSAN"` and `"Nissan"` both become `"Nissan"` — the UNIQUE constraint fires
correctly and no duplicates are created. Running scripts in any order is safe.

**Three-level vehicle identity:**
```
Make         → vehicle_makes    (e.g., Nissan)
Model        → vehicle_models   (e.g., Silvia)
Variant      → vehicle_variants (e.g., S14 Kouki, engine: SR20DET, 220 HP)
cars.chassis_code               (e.g., S14 — free text fallback)
```

**Search aliases:** `vehicle_search_aliases` table with 100+ curated entries.
Search logic: query aliases → query models/variants → deduplicate → return combined.

---

## UPDATES TO PART 17 — ROW LEVEL SECURITY

### Public Profile Data Boundary (decided — Session 2)

**/builds/:username publicly exposes:**
- Car identity (year, make, model, trim, nickname, color)
- Performance specs (HP, torque, mileage) — display-converted at app layer
- Timeline entries (is_origin and add_to_timeline entries)
- Job photos (from public cars)
- Build Sheet via `public_build_sheet` view:
  - brand, title, category, status, date_installed
  - **EXCLUDES: cost, cost_currency, cost_notes**
- Build Investment total (ONLY if `cars.show_investment_publicly = true`)

**/builds/:username never exposes (even for public cars):**
- VIN, license plate, paint code
- Purchase price, purchase dealer
- Session details (shop name, session notes, service mileage)
- Maintenance / service history
- Receipts and financial documents
- Contacts
- Legal documents (registration, insurance, title)

### New RLS Policy

```sql
-- Public read for installed modifications on public cars
-- Cost data is excluded by the view — RLS handles row access only
create policy "jobs_select_public_buildsheet"
  on jobs for select
  using (
    status = 'installed'
    and type = 'modification'
    and car_id in (
      select id from cars where is_public = true and deleted_at is null
    )
  );
```

---

## UPDATES TO PART 22 — INFRASTRUCTURE

### Edge Function: nightly-purge

**Replaces any pg_cron approach entirely.**

Location: `supabase/edge-functions/nightly-purge/index.ts`
Schedule: `0 3 * * *` (3 AM UTC daily)
Deploy: `supabase functions deploy nightly-purge --schedule "0 3 * * *"`

**What it does:**
1. Finds cars with `deleted_at < now() - 7 days`
2. Deletes all Storage files across 5 buckets (car-photos, job-photos, timeline-photos, receipts, car-documents)
3. Hard-deletes car rows (cascade handles all child tables)
4. Logs result to `analytics_events` for monitoring

**Why Edge Function over pg_cron:**
pg_cron can only run SQL. It cannot access the Storage API. Orphaned files would
accumulate forever. The Edge Function handles both DB and Storage in one run.

### Storage Buckets (5 total — replaces 4-bucket list in v2.5)

| Bucket | Public | Types | Max Size |
|---|---|---|---|
| `car-photos` | YES | images | 10MB |
| `job-photos` | YES | images | 20MB |
| `receipts` | **NO** | images + PDF | 20MB |
| `timeline-photos` | YES | images | 15MB |
| `car-documents` | **NO** | images + PDF | 20MB |

`car-documents` is a **new bucket not in v2.5**. Legal documents (registration,
insurance, title) must be in a private bucket with signed-URL access. They cannot
share the public `car-photos` bucket — they contain VINs, policy numbers, and
plate numbers.

---

## FUTURE FEATURES — DATABASE DESIGN

The following features are NOT built yet. Their data models are designed and
documented here so future implementation never requires breaking schema changes.

### TIER 1: Add before or shortly after native app launch

**CarQuery full import**
When: Before or at native app launch
Action: Run `import_carquery.js` with commercial API key
Why: CarQuery covers JDM-only and rare models that NHTSA misses entirely

**Community vehicle contribution**
When: First 6 months post-launch
Data model: Already supported — `source = 'user_added'` and `is_active = false`
Flow: User submits unlisted vehicle → stored with `is_active = false` → admin
approves in Supabase dashboard → `is_active = true` → appears in autocomplete

### TIER 2: Price Aggregator

**When to build:** When you have 500+ active users with logged build costs.
Without enough data points (minimum 5 per part), averages are meaningless.

**What needs building:**
- UI: Show "avg paid: $XXX" label on job entry and browse views
- Query: Already designed (see SUMMARY.md — Price Aggregation Design Spec)
- New materialized view:

```sql
CREATE MATERIALIZED VIEW api_parts_popularity AS
  SELECT
    j.brand,
    j.part_number,
    j.category,
    vm.make_name,
    vmo.model_name,
    COUNT(*)         AS install_count,
    AVG(j.cost)      AS avg_cost,
    MIN(j.cost)      AS min_cost,
    MAX(j.cost)      AS max_cost
  FROM jobs j
  JOIN sessions s ON s.id = j.session_id
  JOIN cars c ON c.id = j.car_id
  LEFT JOIN vehicle_makes vm ON vm.id = c.make_id
  LEFT JOIN vehicle_models vmo ON vmo.id = c.model_id
  WHERE j.status = 'installed'
    AND j.cost > 0
    AND j.cost_notes IS NULL
    AND c.is_public = true
  GROUP BY j.brand, j.part_number, j.category, vm.make_name, vmo.model_name
  HAVING COUNT(*) >= 5;

-- Refresh monthly via Edge Function or pg_cron
-- REFRESH MATERIALIZED VIEW CONCURRENTLY api_parts_popularity;
```

**No schema changes needed.** All data already exists in `jobs`.

### TIER 3: Marketplace

**When to build:** After successful price aggregator launch. Marketplace listings
need credible data foundation to be worth more than Craigslist.

**New tables needed:**
```sql
create table listings (
  id              uuid primary key,
  car_id          uuid references cars(id),   -- The entire build history is the listing
  user_id         uuid references users(id),
  asking_price    decimal(10,2),
  asking_currency char(3) default 'USD',
  description     text,
  location_city   text,
  location_country text,
  is_active       boolean default true,
  views           integer default 0,
  created_at      timestamptz,
  sold_at         timestamptz,
  sold_price      decimal(10,2)
);

create table listing_inquiries (
  id          uuid primary key,
  listing_id  uuid references listings(id),
  user_id     uuid references users(id),   -- Who's asking
  message     text,
  created_at  timestamptz
);
```

**Automatic provenance:** The build history (jobs), service history (sessions),
receipts, and photos are already in the database. The listing page just displays
them — no additional data entry required. This is the core differentiator.

### TIER 4: API Product

**When to build:** After marketplace launch, when you have enough data to be valuable.

**New tables needed:**
```sql
create table api_keys (
  id          uuid primary key,
  user_id     uuid references users(id),
  key_hash    text unique not null,   -- Never store the raw key
  key_prefix  text,                  -- First 8 chars for display: "gd_sk_ab..."
  plan        text check (plan in ('starter','pro','enterprise')),
  rate_limit  integer default 1000,  -- Requests per day
  is_active   boolean default true,
  last_used   timestamptz,
  created_at  timestamptz,
  expires_at  timestamptz
);

create table api_requests (
  id          bigserial primary key,
  key_id      uuid references api_keys(id),
  endpoint    text,
  status_code integer,
  response_ms integer,
  created_at  timestamptz
);
```

**Data sold:** Aggregated, anonymized queries against `api_parts_popularity`
materialized view. Example endpoints:
- `GET /api/v1/parts/popular?make=Nissan&model=Silvia` — most installed parts
- `GET /api/v1/parts/price?brand=Tein&part=VSP48-C1BS3` — market price data
- `GET /api/v1/builds/stats?make=Nissan&model=Silvia&year=1995` — build statistics

**Revenue model:** Monthly subscription or per-1000-requests billing.
Rate limiting via `api_requests` table count per rolling 24h window.

### TIER 5: Read Replicas

**When to add:** 500+ sustained concurrent active users.
**How to add:** Supabase dashboard → Database → Replication → Add Replica.
**Code changes required:** Zero. Supabase client automatically routes reads
to replicas and writes to primary.
**Cost:** Supabase Pro plan + per-replica cost (~$25/month/replica).

### TIER 6: Elasticsearch (If Needed)

**When to consider:** Only if "search across all public builds" becomes a
high-priority feature AND Postgres full-text search is demonstrably inadequate.
**Threshold:** Postgres FTS handles up to ~10M rows well. G-Dimension would need
tens of millions of job notes records before Elasticsearch is relevant.
**Verdict:** Not needed. Not planned. Revisit only if explicitly requested
post-1M users.

---

## OPEN QUESTIONS BEFORE STEP 5 (Auth Screens)

All three original Q1/Q2/Q3 are resolved. These two remain:

**Q4 — Public profile data boundary:** ✅ RESOLVED in this document.
See "Updates to Part 17 — Row Level Security" above.

**Q5 — Build Investment visibility:** ✅ RESOLVED.
Default false. `cars.show_investment_publicly` toggle. User controls per car.

**No remaining blockers.** Claude Code can begin Step 5 (Auth screens) with the
database as specified in migrations 001–023 + both import scripts.

---

*G-Dimension Architecture Addendum v1.0*
*Merge into MASTER_ARCHITECTURE.md v3.0 before next major session.*
