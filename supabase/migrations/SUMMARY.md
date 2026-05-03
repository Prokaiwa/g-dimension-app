# G-DIMENSION — Supabase Setup Summary v3.0
## Sessions 1, 2, and 3 complete. All open questions resolved.

---

## COMPLETE MIGRATION ORDER

```
001_users.sql                       users + auth sync trigger
002_vehicle_makes.sql               makes reference + pg_trgm
003_vehicle_models.sql              models reference + btree_gist
004_cars.sql                        cars + soft delete + is_import + purchase_currency
005_sessions.sql                    sessions
006_jobs.sql            ★ v2        jobs + car_id + still_owned + cost_notes
                                    + removed→Parts Bin trigger
007_timeline_entries.sql            timeline_entries + auto-create + origin guard
008_job_photos.sql                  job_photos + car_id denorm trigger
009_receipts.sql                    receipts + car_id denorm trigger
010_014_support_tables.sql          car_contacts, car_documents, car_reminders,
                                    error_logs, analytics_events
015_rls_policies.sql                all RLS policies
016_indexes.sql                     composite + covering + partial indexes
017_vehicle_variants.sql  ★ new     chassis codes + seed data (S14, BNR34, EK9...)
                                    + adds variant_id + chassis_code to cars
018_vehicle_search_aliases.sql ★ new alias layer (Evo/Evolution, S14, 240SX, AE86...)
019_022_infrastructure_tables.sql ★ user_flags, audit_log (with triggers),
                                    notification_preferences
023_public_profile_boundary.sql ★   show_investment_publicly on cars,
                                    public_build_sheet VIEW,
                                    public_car_profiles VIEW,
                                    build_investment_public VIEW,
                                    jobs public read RLS policy
```

**Edge Functions:**
```
supabase/edge-functions/nightly-purge/index.ts   DB + Storage purge
  Cron: "0 3 * * *" (3 AM UTC)
  Deploy: supabase functions deploy nightly-purge --schedule "0 3 * * *"
```

**Import Scripts:**
```
scripts/import_nhtsa.js      US market + JDM seed (free, run at setup)
scripts/import_carquery.js   Global + variant enrichment (run when ready)
```

---

## PRE-RELEASE CHECKLIST
## Everything here must be done before the first real user touches the app.

### Database (migrations)
- [ ] Run migrations 001–023 in order: `supabase db push`
- [ ] Verify migration output — no errors on any file
- [ ] Run `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
      Confirm every user-data table has `rowsecurity = true`

### Vehicle Data Import
- [ ] Run `node scripts/import_nhtsa.js` — US market + JDM seed
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_makes;` (expect 500+)
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_models;` (expect 5,000+)
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_variants;` (expect 50+ from seed)
- [ ] Verify: `SELECT COUNT(*) FROM vehicle_search_aliases;` (expect 100+)
- [ ] Test autocomplete: search "Evo" → returns "Lancer Evolution" rows
- [ ] Test autocomplete: search "S14" → returns "Silvia S14" rows
- [ ] Test autocomplete: search "240sx" → returns Silvia results

### CarQuery Import (recommended before launch — covers unique imports)
- [ ] Obtain CarQuery API key (carqueryapi.com — commercial license)
- [ ] Run `node scripts/import_carquery.js --year 2000` (single year test)
- [ ] Verify no duplicate makes: `SELECT make_name, COUNT(*) FROM vehicle_makes GROUP BY make_name HAVING COUNT(*) > 1;`
- [ ] Run full import: `node scripts/import_carquery.js`
- [ ] Verify variant enrichment for key models

### Auth
- [ ] Enable Email/Password provider in Supabase Dashboard
- [ ] Enable "Confirm email" ON
- [ ] Configure Google OAuth (see AUTH_SETUP.md — Steps 1–3)
- [ ] Configure Apple OAuth (see AUTH_SETUP.md — required for App Store)
- [ ] Set Site URL: `https://gdimension.app`
- [ ] Add all redirect URLs (see AUTH_SETUP.md — Step 4)
- [ ] Enable Link Identities: Dashboard → Auth → Settings → ON
- [ ] Test trigger: Create a test user → verify public.users row appears automatically
- [ ] Test RLS: Logged-out user can read a public car, cannot read receipts

### Storage Buckets
- [ ] Run `supabase/storage/buckets.sql`
- [ ] Verify 5 buckets exist: car-photos, job-photos, receipts, timeline-photos, car-documents
- [ ] Verify car-photos is PUBLIC
- [ ] Verify receipts is PRIVATE
- [ ] Verify car-documents is PRIVATE
- [ ] Test upload to car-photos as authenticated user (should succeed)
- [ ] Test read from receipts as anonymous user (should fail)

### Edge Function
- [ ] Deploy nightly-purge: `supabase functions deploy nightly-purge --schedule "0 3 * * *"`
- [ ] Invoke manually to test: `supabase functions invoke nightly-purge`
- [ ] Verify run logged in analytics_events: `SELECT * FROM analytics_events WHERE event_name = 'nightly_purge_completed';`

### Final Verification Queries
```sql
-- 1. All tables have RLS enabled
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
  AND tablename NOT IN ('vehicle_makes','vehicle_models','vehicle_variants','vehicle_search_aliases');
-- Expect: 0 rows (all user tables secured)

-- 2. Auth trigger works
-- (After creating a test user via Supabase Auth)
SELECT id, email, username FROM users ORDER BY created_at DESC LIMIT 1;
-- Expect: row exists with auto-generated username

-- 3. Origin entry protection
-- (After creating a car and origin entry)
DELETE FROM timeline_entries WHERE is_origin = true LIMIT 1;
-- Expect: ERROR — "Origin Entry cannot be deleted."

-- 4. Vehicle search works
SELECT alias, canonical FROM vehicle_search_aliases
WHERE lower(alias) LIKE 'evo%' LIMIT 5;
-- Expect: rows mapping to Lancer Evolution variants

-- 5. Public profile boundary
-- As anon user:
SELECT cost FROM public_build_sheet LIMIT 1;
-- Expect: column does not exist (view excludes it)
```

---

## FUTURE FEATURES — PHASED ROADMAP

### Phase 2 — Shortly After Native App Launch

**CarQuery Full Import** (if not done pre-launch)
- Run `import_carquery.js` with commercial API key
- Adds global makes, EU market vehicles, trimmed variant data
- Recommended at first month of revenue at latest

**Community Vehicle Contribution**
- Allow users to submit unlisted makes/models/variants
- Stored with `source = 'user_added'`, `is_active = false`
- Admin approves in Supabase dashboard → `is_active = true`
- No new tables needed — schema supports this already

**Push Notifications**
- `notification_preferences` table already built and ready
- Requires native app (APNs for iOS, FCM for Android)
- Not available in PWA phase (iOS Safari doesn't support background push)
- When ready: integrate RevenueCat + APNs/FCM, populate `push_token`

### Phase 3 — Price Aggregator

**Trigger:** 500+ active users with logged build costs (enough data for meaningful averages)

**What to build:**
- Materialized view `api_parts_popularity` (SQL in ARCHITECTURE_ADDENDUM.md)
- UI: "avg paid: $XXX (23 builds)" label on Add Job and Build Sheet
- Monthly refresh cron: `REFRESH MATERIALIZED VIEW CONCURRENTLY api_parts_popularity`
- Outlier filter: exclude cost > AVG*3, exclude cost_notes IS NOT NULL, minimum 5 data points

**Schema changes needed:** None. All data exists in `jobs` today.

**Cost_notes field** (`jobs.cost_notes`) is already capturing free/sponsored parts.
The aggregation query already excludes these. Price data quality is being preserved
from day one even before the feature exists.

### Phase 4 — Marketplace

**Trigger:** Post price aggregator. Credible build history = credible listings.

**New tables:**
```sql
listings (id, car_id, user_id, asking_price, asking_currency,
          description, location_city, location_country,
          is_active, views, created_at, sold_at, sold_price)

listing_inquiries (id, listing_id, user_id, message, created_at)
```

**Automatic provenance:** The build history, service records, receipts, and photos
are already attached to the car. The listing page displays them — no extra data entry.
This is the moat against Craigslist and Facebook Marketplace.

**RLS:** Listings are public (anyone can view). Inquiries are private (owner + sender).

### Phase 5 — API Product

**Trigger:** Post marketplace, 1M+ build records in the database.

**New tables:**
```sql
api_keys (id, user_id, key_hash, key_prefix, plan, rate_limit, is_active, expires_at)
api_requests (id, key_id, endpoint, status_code, response_ms, created_at)
```

**Data product:** Aggregate queries against `api_parts_popularity` view.
Example: "What are the most installed suspension parts on a Nissan Silvia S14?"

**Pricing model:** Tiered subscription or per-1000-requests billing.
The data is valuable because it's real transaction data, not scraped listings.

### Phase 6 — Read Replicas

**Trigger:** 500+ sustained concurrent active users (performance observation)
**Action:** Supabase dashboard → Database → Replication → Add Replica
**Code changes:** Zero. Supabase client handles routing automatically.
**Cost:** ~$25/month per replica on Pro plan

---

## DECISIONS LOG — ALL SESSIONS

### Schema Architecture
- `users.id` references `auth.users(id)` — not a surrogate key (Session 1)
- `job_photos.car_id` and `receipts.car_id` denormalized — hot path performance (Session 1)
- `session_id` nullable on `jobs` — Blueprint/Parts Bin have no session anchor (Session 1)
- Origin Entry protected by `BEFORE DELETE` trigger at DB level (Session 1)
- Pre-auth errors use `anon` INSERT policy on error_logs (Session 1)
- `car-documents` is a 5th private storage bucket — legal docs must not be public (Session 1)

### Jobs Lifecycle
- `jobs.car_id` added as nullable direct anchor — resolves Blueprint/Parts Bin car context (Session 2)
- `jobs.still_owned` drives the removed→Parts Bin trigger (Session 2)
- `jobs.cost_notes` excludes free/sponsored parts from price aggregation (Session 2)
- Removed part + still_owned=true → DB trigger auto-creates new purchased job (Session 2)

### Vehicle Database
- Three-level identity: make → model → variant → chassis_code (Session 2)
- Dual import strategy: NHTSA (free, US) + CarQuery (paid, global) (Session 3)
- Both scripts normalize to Title Case — no duplicates across sources (Session 3)
- `vehicle_search_aliases` table with 100+ curated entries (Session 2)
- "Evo" and "Evolution" → same results. "S14" → Silvia S14. "240SX" → Silvia. (Session 2)
- `source` column tracks data provenance (nhtsa/carquery/jdm_manual/user_added) (Session 2)

### Public Profile Boundary
- Build Sheet (brand, title, category) — publicly visible (Session 3)
- Job costs — private, excluded from `public_build_sheet` view (Session 3)
- VIN, license plate, purchase price — excluded from `public_car_profiles` view (Session 3)
- Build Investment — private by default, `show_investment_publicly` toggle per car (Session 3)
- Sessions, maintenance, receipts, contacts, documents — private always (Session 3)

### Infrastructure
- Edge Function replaces pg_cron — handles DB + Storage cleanup (Session 2)
- Auth Link Identities enabled — same email works across OAuth providers (Session 2)
- `user_flags` for staged rollouts — no code deploys needed for beta features (Session 2)
- `audit_log` with triggers on cars/jobs/sessions/timeline_entries (Session 2)
- `notification_preferences` pre-built for native app push (Session 2)

### Forward-Looking Design
- `jobs.brand` + `jobs.part_number` + `jobs.cost` = price aggregator data (already collecting)
- `listings` table designed — marketplace ready when triggered (Session 3)
- `api_keys` + `api_requests` designed — API product ready when triggered (Session 3)
- `api_parts_popularity` materialized view documented — no schema changes needed (Session 3)
- `is_import` on cars — surfaces JDM/EU import context in marketplace (Session 2)

---

## CONFIDENCE SCORE

**Session 1:** 7.5 / 10
**Session 2:** 9.0 / 10
**Session 3:** 9.5 / 10

**What earns the 9.5:**
- All open questions from Session 1 resolved
- Public profile boundary decided and implemented with views
- Build Investment visibility decided and implemented
- Complete dual vehicle import strategy with deduplication
- Pre-release checklist covers every step from migrations to live verification
- Future features phased and documented without blocking current work
- Every future feature designed to require zero schema changes to existing tables
- Audit trail, feature flags, and notification infrastructure ready before they're needed

**What keeps it from 10:**
- CarQuery full import not yet run (data pending, not a schema issue)
- JDM variant coverage ~50 cars — community contribution system not yet built
- Multi-currency display logic designed but not yet implemented in app layer
- No load testing on RLS subquery performance at scale (academic concern until 50k+ users)

**No remaining blockers.** Claude Code can begin Step 5 — Auth screens.

---

*G-Dimension Supabase Setup Summary v3.0*
*Sessions 1–3 complete. All schema decisions made. Pre-release checklist ready.*
