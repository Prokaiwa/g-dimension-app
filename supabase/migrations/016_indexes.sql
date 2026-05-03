-- =============================================================================
-- G-DIMENSION — Migration 016: Indexes
-- =============================================================================
-- Comprehensive index set for the most common query patterns.
-- Indexes already defined inline in table migrations are noted but not
-- re-created (Postgres will error on duplicate index creation).
-- This file adds composite and covering indexes for complex query patterns.
--
-- INDEX STRATEGY:
--   - Partial indexes (WHERE clause) are used wherever a filtered subset
--     is always queried — dramatically reduces index size and scan cost.
--   - Composite indexes are ordered by: highest-cardinality first, then
--     sort column last (for ORDER BY without filesort).
--   - CONCURRENTLY is used for any index added post-launch to avoid table locks.
--     During initial scaffold, CONCURRENTLY is not needed.
-- =============================================================================


-- =============================================================================
-- QUERY 1: All active cars for a user
-- Pattern: SELECT * FROM cars WHERE user_id = $1 AND deleted_at IS NULL
-- Already defined in 004_cars.sql as: cars_user_id_active
-- =============================================================================
-- (already exists)


-- =============================================================================
-- QUERY 2: All sessions for a car, newest first
-- Pattern: SELECT * FROM sessions WHERE car_id = $1 ORDER BY date_performed DESC
-- Already defined in 005_sessions.sql as: sessions_car_id
-- =============================================================================
-- (already exists)


-- =============================================================================
-- QUERY 3: All jobs for a session
-- Pattern: SELECT * FROM jobs WHERE session_id = $1
-- Already defined in 006_jobs.sql as: jobs_session_id
-- =============================================================================
-- (already exists)


-- =============================================================================
-- QUERY 4: Timeline entries for a car, chronological (oldest first)
-- Pattern: SELECT * FROM timeline_entries WHERE car_id = $1
--          ORDER BY display_date ASC
-- Already defined in 007_timeline_entries.sql as: timeline_entries_car_date
-- =============================================================================
-- (already exists)


-- =============================================================================
-- QUERY 5: Photos filtered by job type for a car (Photos gallery)
-- Pattern: SELECT jp.* FROM job_photos jp
--          JOIN jobs j ON j.id = jp.job_id
--          WHERE jp.car_id = $1 AND j.type = $2
--          ORDER BY jp.created_at DESC
-- The denormalized car_id enables the first filter as a direct lookup.
-- The type filter requires a join — the composite index below covers it.
-- =============================================================================

create index if not exists job_photos_car_id_created
  on public.job_photos (car_id, created_at desc);

-- Covering index for Photos gallery filtered queries
-- Avoids table heap fetch when only photo_url and job_id are needed
create index if not exists job_photos_car_job_url
  on public.job_photos (car_id, job_id)
  include (photo_url, caption, created_at);


-- =============================================================================
-- QUERY 6: Build Sheet — installed mods for a car
-- Pattern: SELECT j.* FROM jobs j
--          JOIN sessions s ON s.id = j.session_id
--          WHERE s.car_id = $1 AND j.type = 'modification' AND j.status = 'installed'
--          ORDER BY j.created_at DESC
-- =============================================================================

-- This is the Build Sheet's primary query — it must be fast.
-- The sessions table has car_id; jobs are reached through session_id.
-- Partial index on sessions for modification sessions only:
create index if not exists sessions_car_modification
  on public.sessions (car_id, date_performed desc)
  where type = 'modification';

-- Partial index on jobs for installed modifications
-- session_id is the join key + status filter pre-applied
create index if not exists jobs_session_installed_mod
  on public.jobs (session_id, category, created_at desc)
  where type = 'modification' and status = 'installed';


-- =============================================================================
-- QUERY 7: Parts Bin — purchased but not yet installed, for a car
-- Same join pattern as Build Sheet but status = 'purchased'
-- =============================================================================
create index if not exists jobs_session_purchased
  on public.jobs (session_id, created_at desc)
  where status = 'purchased';


-- =============================================================================
-- QUERY 8: Blueprint — planned jobs for a car
-- =============================================================================
create index if not exists jobs_session_planned
  on public.jobs (session_id, created_at desc)
  where status = 'planned';


-- =============================================================================
-- QUERY 9: Snapshot — total build investment for a car
-- Pattern: SELECT SUM(amount) FROM receipts WHERE car_id = $1
-- =============================================================================
create index if not exists receipts_car_id_amount
  on public.receipts (car_id)
  include (amount, currency);


-- =============================================================================
-- QUERY 10: Upcoming reminders for a car
-- Pattern: SELECT * FROM car_reminders
--          WHERE car_id = $1 AND is_complete = false
--          AND (due_date >= current_date OR due_mileage IS NOT NULL)
--          ORDER BY due_date ASC NULLS LAST
-- =============================================================================
create index if not exists car_reminders_upcoming
  on public.car_reminders (car_id, due_date asc nulls last)
  where is_complete = false;


-- =============================================================================
-- QUERY 11: Public profile page (/builds/:username)
-- Pattern 1: SELECT * FROM users WHERE username = $1
-- Pattern 2: SELECT * FROM cars WHERE user_id = $1 AND is_public = true AND deleted_at IS NULL
-- =============================================================================
create unique index if not exists users_username_lower
  on public.users (lower(username));
-- Case-insensitive username lookups

-- (cars_public_active already defined in 004_cars.sql)


-- =============================================================================
-- QUERY 12: Vehicle autocomplete in Add Car form
-- Pattern: SELECT * FROM vehicle_makes WHERE make_name ILIKE $1 || '%'
-- Pattern: SELECT * FROM vehicle_models WHERE make_id = $1 AND model_name ILIKE $2 || '%'
-- Uses trigram indexes already created in 002 and 003 migrations.
-- =============================================================================
-- (already exists via gin_trgm_ops indexes)


-- =============================================================================
-- QUERY 13: Maintenance history strip (recent sessions by type)
-- Pattern: SELECT * FROM sessions WHERE car_id = $1 AND type IN ('maintenance','detail')
--          ORDER BY date_performed DESC LIMIT 10
-- =============================================================================
create index if not exists sessions_car_maintenance
  on public.sessions (car_id, date_performed desc)
  where type in ('maintenance', 'detail');


-- =============================================================================
-- QUERY 14: Error log monitoring (admin / future dashboard)
-- Pattern: SELECT * FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours'
-- =============================================================================
create index if not exists error_logs_recent
  on public.error_logs (created_at desc);
-- Partial index with now() is not allowed (now() is not immutable).
-- Use a WHERE clause in your queries instead:
-- SELECT * FROM error_logs WHERE created_at > now() - interval '24 hours'


-- =============================================================================
-- QUERY 15: Analytics aggregation (admin + future API product)
-- Pattern: SELECT event_name, COUNT(*) FROM analytics_events
--          WHERE created_at > $1 GROUP BY event_name
-- =============================================================================
create index if not exists analytics_events_name_date
  on public.analytics_events (event_name, created_at desc);


-- =============================================================================
-- FUTURE: Full-text search on job notes (Part 27 — deferred feature)
-- When job search feature launches, add:
--   ALTER TABLE jobs ADD COLUMN notes_tsv tsvector
--     GENERATED ALWAYS AS (to_tsvector('english', coalesce(notes, ''))) STORED;
--   CREATE INDEX jobs_notes_fts ON jobs USING GIN (notes_tsv);
-- Do NOT add this now — generated columns add write overhead and the feature
-- is explicitly deferred per the architecture.
-- =============================================================================
