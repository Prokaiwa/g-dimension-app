# G-DIMENSION — Supabase Setup via Dashboard
## No CLI or Claude Code Required

Everything can be done at supabase.com → your project dashboard.
Follow these steps in order. Each section links to the exact dashboard location.

---

## STEP 1 — EXTENSIONS (do this first)

**Dashboard → Database → Extensions**

Enable these three extensions (search for each and click enable):

1. `pg_trgm` — fuzzy text search for vehicle autocomplete
2. `btree_gist` — needed for the Origin Entry uniqueness constraint
3. `pg_cron` — optional (skip if using Edge Function for nightly purge)
4. `uuid-ossp` — usually already enabled

---

## STEP 2 — RUN MIGRATIONS (SQL Editor)

**Dashboard → SQL Editor → New Query**

Paste and run each migration file in order. **One file at a time. Check for errors before moving to the next.**

### Running order and what each does:

**001_users.sql** — Paste entire file → Run
*Creates the users profile table and the auto-sync trigger with auth.*

**002_vehicle_makes.sql** → Run
*Creates the vehicle manufacturer reference table.*

**003_vehicle_models.sql** → Run
*Creates the vehicle model reference table.*

**004_cars.sql** → Run
*Creates the core cars table with all specs and soft delete.*

**005_sessions.sql** → Run
*Creates the sessions table (one shop visit = one session).*

**006_jobs.sql** → Run
*Creates the jobs table with the Parts Bin lifecycle trigger.*

**007_timeline_entries.sql** → Run
*Creates timeline entries + the auto-sync trigger + origin entry protection.*

**008_job_photos.sql** → Run
*Creates job photos table with car_id auto-populate.*

**009_receipts.sql** → Run
*Creates receipts table with car_id auto-populate.*

**010_014_support_tables.sql** → Run
*Creates contacts, documents, reminders, error logs, and analytics.*

**015_rls_policies.sql** → Run
*Creates ALL security policies. Critical — run this carefully.*

**016_indexes.sql** → Run
*Creates performance indexes for all major queries.*

**017_vehicle_variants.sql** → Run
*Creates chassis code table (S14, EK9, BNR34) + seed data.*
Note: If you get an error about `vehicle_variants` referencing models that don't exist yet — that's expected if you haven't run the NHTSA import yet. The DO block at the bottom will just skip those seeds.

**018_vehicle_search_aliases.sql** → Run
*Creates the Evo/Evolution alias layer with 100+ entries.*

**019_022_infrastructure_tables.sql** → Run
*Creates user_flags, audit_log (with triggers), and notification_preferences.*

**023_public_profile_boundary.sql** → Run
*Creates public profile views and adds the investment visibility toggle.*

### Verify all migrations ran:
```sql
-- Paste this to see all your tables:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

You should see: analytics_events, audit_log, car_contacts, car_documents, car_reminders, cars, error_logs, job_photos, jobs, notification_preferences, receipts, sessions, timeline_entries, user_flags, users, vehicle_makes, vehicle_models, vehicle_search_aliases, vehicle_variants.

```sql
-- Verify all user tables have RLS on:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
  AND tablename NOT IN (
    'vehicle_makes','vehicle_models',
    'vehicle_variants','vehicle_search_aliases'
  );
-- Should return 0 rows
```

---

## STEP 3 — SEED VEHICLE DATA (SQL Editor)

The NHTSA import script requires Node.js on your computer. But you can seed a basic starter dataset directly in the SQL Editor.

### Option A: Run the Node.js script (recommended)

On your computer with Node.js installed:
```bash
npm install @supabase/supabase-js
node scripts/import_nhtsa.js
```

Set environment variables first:
```
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key from Project Settings → API]
```

### Option B: Manual SQL seed for testing

If you can't run the script yet, paste this minimal seed to test with:
```sql
-- Minimal seed for testing — run in SQL Editor
INSERT INTO vehicle_makes (make_name, source, regions, country) VALUES
  ('Nissan', 'jdm_manual', '{"US","JP"}', 'JP'),
  ('Toyota', 'jdm_manual', '{"US","JP"}', 'JP'),
  ('Honda',  'jdm_manual', '{"US","JP"}', 'JP'),
  ('Mazda',  'jdm_manual', '{"US","JP"}', 'JP'),
  ('Subaru', 'jdm_manual', '{"US","JP"}', 'JP'),
  ('Mitsubishi', 'jdm_manual', '{"US","JP"}', 'JP'),
  ('Ford',   'nhtsa',      '{"US"}',      'US'),
  ('Chevrolet','nhtsa',    '{"US"}',      'US'),
  ('Dodge',  'nhtsa',      '{"US"}',      'US'),
  ('BMW',    'nhtsa',      '{"US","DE"}', 'DE'),
  ('Volkswagen','nhtsa',   '{"US","DE"}', 'DE')
ON CONFLICT (make_name) DO NOTHING;

-- Then add a few models for testing:
INSERT INTO vehicle_models (make_id, model_name, year_start, year_end, source)
SELECT m.id, '240SX',  1989, 1998, 'nhtsa' FROM vehicle_makes m WHERE m.make_name = 'Nissan'
UNION ALL
SELECT m.id, 'Silvia', 1988, 2002, 'jdm_manual' FROM vehicle_makes m WHERE m.make_name = 'Nissan'
UNION ALL
SELECT m.id, 'Skyline', 1989, 2002, 'jdm_manual' FROM vehicle_makes m WHERE m.make_name = 'Nissan'
UNION ALL
SELECT m.id, 'GT-R',   2009, NULL,  'nhtsa' FROM vehicle_makes m WHERE m.make_name = 'Nissan'
UNION ALL
SELECT m.id, 'Supra',  1993, 1998, 'nhtsa' FROM vehicle_makes m WHERE m.make_name = 'Toyota'
UNION ALL
SELECT m.id, 'RX-7',   1979, 2002, 'nhtsa' FROM vehicle_makes m WHERE m.make_name = 'Mazda'
UNION ALL
SELECT m.id, 'Civic',  1992, NULL,  'nhtsa' FROM vehicle_makes m WHERE m.make_name = 'Honda'
ON CONFLICT (make_id, model_name) DO NOTHING;
```

Run the full NHTSA script when you have Node.js available — this is just for testing.

---

## STEP 4 — STORAGE BUCKETS

**Dashboard → Storage → New Bucket**

Create 5 buckets with these exact settings:

### Bucket 1: car-photos
- Name: `car-photos`
- Public bucket: **ON**
- File size limit: 10MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic`

### Bucket 2: job-photos
- Name: `job-photos`
- Public bucket: **ON**
- File size limit: 20MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic`

### Bucket 3: receipts
- Name: `receipts`
- Public bucket: **OFF** ← IMPORTANT: private
- File size limit: 20MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic, application/pdf`

### Bucket 4: timeline-photos
- Name: `timeline-photos`
- Public bucket: **ON**
- File size limit: 15MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic`

### Bucket 5: car-documents
- Name: `car-documents`
- Public bucket: **OFF** ← IMPORTANT: private
- File size limit: 20MB
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/heic, application/pdf`

### Storage RLS Policies

After creating each bucket, add storage policies.

**Dashboard → Storage → [bucket name] → Policies → New Policy**

For **car-photos** (repeat for job-photos and timeline-photos):
```
Policy name: Owner upload
Allowed operation: INSERT
Target roles: authenticated
Policy definition: (storage.foldername(name))[1] = auth.uid()::text
```
```
Policy name: Public read
Allowed operation: SELECT
Target roles: anon, authenticated
Policy definition: true
```
```
Policy name: Owner delete
Allowed operation: DELETE
Target roles: authenticated
Policy definition: (storage.foldername(name))[1] = auth.uid()::text
```

For **receipts** and **car-documents** (private buckets):
```
Policy name: Owner upload
Allowed operation: INSERT
Target roles: authenticated
Policy definition: (storage.foldername(name))[1] = auth.uid()::text
```
```
Policy name: Owner read (NO anon role)
Allowed operation: SELECT
Target roles: authenticated
Policy definition: (storage.foldername(name))[1] = auth.uid()::text
```
```
Policy name: Owner delete
Allowed operation: DELETE
Target roles: authenticated
Policy definition: (storage.foldername(name))[1] = auth.uid()::text
```

---

## STEP 5 — AUTHENTICATION

**Dashboard → Authentication → Providers**

### Email
- Enable Email Provider: **ON**
- Confirm Email: **ON**
- Secure Email Change: **ON**

### Google OAuth
1. Go to console.cloud.google.com → create project → OAuth consent screen
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URI: `https://[your-project-ref].supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase: Providers → Google → paste Client ID + Secret → Enable

### Apple OAuth (required for App Store)
1. Go to developer.apple.com → Identifiers → Services ID
2. Create services ID: `app.gdimension.service`
3. Configure Sign In with Apple → add your Supabase callback URL
4. Create a Key with Sign In with Apple capability
5. In Supabase: Providers → Apple → paste credentials → Enable

### URL Configuration
**Dashboard → Authentication → URL Configuration**

- Site URL: `https://gdimension.app`
- Redirect URLs (add all of these):
  ```
  https://gdimension.app/home
  https://gdimension.app/auth/callback
  http://localhost:5173/home
  http://localhost:5173/auth/callback
  ```

### Link Identities (prevents duplicate accounts)
**Dashboard → Authentication → Settings**
- "Allow linking identities" → **ON**

### Email Templates
**Dashboard → Authentication → Email Templates**

Update Confirm Signup email:
- From name: `G-Dimension`
- Subject: `Confirm your G-Dimension account`

---

## STEP 6 — EDGE FUNCTION (Nightly Purge)

**Dashboard → Edge Functions → New Function**

1. Function name: `nightly-purge`
2. Paste the contents of `supabase/edge-functions/nightly-purge/index.ts`
3. Click Deploy

**Add cron schedule:**
**Dashboard → Edge Functions → nightly-purge → Schedules → Add Schedule**
- Cron expression: `0 3 * * *`
- This runs at 3 AM UTC every night

**Test it manually:**
**Dashboard → Edge Functions → nightly-purge → Invoke**
(Safe — only purges cars deleted more than 7 days ago, which is none on a fresh database)

---

## STEP 7 — VERIFY EVERYTHING

Run these verification queries in the SQL Editor:

```sql
-- 1. All tables created correctly
SELECT tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Views created correctly
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public';
-- Should show: public_build_sheet, public_car_profiles, build_investment_public

-- 3. Auth trigger working
-- (After manually creating a test user via Dashboard → Authentication → Users → Add User)
SELECT id, email, username, created_at FROM users ORDER BY created_at DESC LIMIT 1;
-- Should show a row matching the test user

-- 4. Vehicle data loaded
SELECT COUNT(*) as makes FROM vehicle_makes;
SELECT COUNT(*) as models FROM vehicle_models;
SELECT COUNT(*) as variants FROM vehicle_variants;
SELECT COUNT(*) as aliases FROM vehicle_search_aliases;

-- 5. Test the Evo alias
SELECT alias, canonical FROM vehicle_search_aliases
WHERE lower(alias) LIKE 'evo%';
-- Should return multiple rows mapping to Lancer Evolution

-- 6. Test public profile security
-- This simulates a query the public profile makes:
SELECT * FROM public_build_sheet LIMIT 5;
-- Should return rows WITHOUT cost, cost_currency, cost_notes columns

-- 7. Verify origin entry protection exists
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'prevent_origin_entry_delete';
-- Should return 1 row
```

---

## COMMON ISSUES & FIXES

**"extension does not exist"**
→ Go to Database → Extensions and enable `pg_trgm`, `btree_gist`, `uuid-ossp` first. Then re-run the failing migration.

**"relation does not exist"**
→ You ran migrations out of order. Check the table it's referencing exists. Run the migration for that table first.

**"permission denied"**
→ Make sure you're pasting into the SQL Editor as the database owner (default for Supabase). You shouldn't need to change anything — Supabase SQL Editor runs as the postgres role.

**"duplicate key value violates unique constraint"**
→ You're running a migration that already ran. This is fine — most inserts use ON CONFLICT DO NOTHING. If the whole migration fails, check which specific statement caused it.

**Auth trigger not creating users row**
→ Go to Database → Functions → look for `handle_new_user`. If it doesn't exist, run migration 001 again. Then create a test user and check the users table.

**Storage policy "already exists"**
→ Skip it — the policy was already created. Check it's configured correctly by clicking it.

---

## GETTING YOUR CREDENTIALS

**Supabase URL and API keys:**
Dashboard → Project Settings → API

- Project URL: your `SUPABASE_URL`
- `anon` `public` key: your `VITE_SUPABASE_ANON_KEY` (goes in `.env.local`)
- `service_role` `secret` key: your `SUPABASE_SERVICE_ROLE_KEY` (NEVER in frontend code — import scripts only)

Create `.env.local` in your project root:
```
VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

The service role key goes in your shell environment or a `.env` file that is gitignored:
```
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
```
