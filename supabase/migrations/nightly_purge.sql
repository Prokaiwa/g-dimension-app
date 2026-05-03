-- =============================================================================
-- G-DIMENSION — Nightly Soft-Delete Purge
-- =============================================================================
-- Cars soft-deleted more than 7 days ago are permanently removed.
-- This implements the recovery window described in Part 27 of the architecture.
--
-- TWO IMPLEMENTATION OPTIONS:
--   Option A: pg_cron (runs inside Postgres — simplest, no cold starts)
--   Option B: Supabase Edge Function + Supabase Cron (more observable)
--
-- RECOMMENDATION: Use pg_cron for this use case. It's a simple DELETE query,
-- not an HTTP-heavy operation. pg_cron is more reliable for DB-level operations.
-- If you want logging and Slack/email alerts, use Option B.
-- =============================================================================


-- =============================================================================
-- OPTION A: pg_cron
-- Enable in Supabase Dashboard → Database → Extensions → pg_cron
-- Or via SQL:
-- =============================================================================

create extension if not exists pg_cron;

-- Grant cron usage to postgres role (Supabase default)
grant usage on schema cron to postgres;

-- Schedule the purge job: runs at 3:00 AM UTC every night
-- Chosen time: low-traffic window; UTC 3am = multiple user-friendly local times
select cron.schedule(
  'nightly-car-purge',          -- Job name (unique, idempotent)
  '0 3 * * *',                  -- Cron expression: 3:00 AM UTC daily
  $$
    -- Hard delete cars that have been soft-deleted for more than 7 days.
    -- cascade ON DELETE handles: sessions → jobs → timeline_entries →
    --   job_photos → receipts → car_contacts → car_documents → car_reminders
    -- Storage files are NOT deleted by this query — see Edge Function note below.
    delete from public.cars
    where deleted_at is not null
      and deleted_at < now() - interval '7 days';
  $$
);

-- =============================================================================
-- STORAGE FILE CLEANUP (important — pg_cron only deletes DB rows)
-- When a car is deleted, its Storage files remain in the buckets.
-- Orphaned files accumulate storage costs over time.
--
-- To handle this, use a database trigger BEFORE the car row is deleted:
-- The trigger logs the storage paths that need to be cleaned up, then an
-- Edge Function (or pg_net) calls the Supabase Storage API to delete them.
--
-- Simpler approach for V1: schedule a weekly Edge Function that scans storage
-- buckets and removes files where the car_id folder no longer has a cars row.
-- =============================================================================

create or replace function public.log_car_deletion_paths()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Log the car's storage paths before deletion for cleanup
  -- In production, this would trigger a Storage cleanup job
  -- For now, it's a no-op placeholder — implement before launch
  raise notice 'Car % deleted. Storage paths to clean: %/%',
    old.id, old.user_id, old.id;
  return old;
end;
$$;

create trigger before_car_hard_delete
  before delete on public.cars
  for each row
  when (old.deleted_at is not null)  -- Only fires on the cron purge, not soft-deletes
  execute procedure public.log_car_deletion_paths();

-- Verify the job is scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'nightly-car-purge';

-- To unschedule:
-- SELECT cron.unschedule('nightly-car-purge');


-- =============================================================================
-- OPTION B: Supabase Edge Function + Cron
-- =============================================================================
-- If you prefer Edge Functions (better logging, alerting, HTTP calls):
--
-- 1. Create file: supabase/functions/nightly-purge/index.ts
-- 2. Schedule via: Dashboard → Edge Functions → Schedules → Add Schedule
--    Or via CLI: supabase functions deploy nightly-purge --schedule "0 3 * * *"
--
-- Edge Function code (TypeScript):
-- =============================================================================


-- Companion Edge Function (TypeScript) — save to:
-- supabase/functions/nightly-purge/index.ts

/*
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Service role bypasses RLS
  )

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  // First: collect storage paths to clean
  const { data: carsToDelete, error: fetchError } = await supabase
    .from('cars')
    .select('id, user_id, garage_photo_url, showcase_photo_url')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff.toISOString())

  if (fetchError) {
    console.error('Failed to fetch cars for deletion:', fetchError)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  if (!carsToDelete || carsToDelete.length === 0) {
    console.log('No cars to purge today.')
    return new Response(JSON.stringify({ purged: 0 }), { status: 200 })
  }

  // Delete storage files for each car
  for (const car of carsToDelete) {
    // List and delete all files in the car's folder across all buckets
    const buckets = ['car-photos', 'job-photos', 'timeline-photos']
    for (const bucket of buckets) {
      const { data: files } = await supabase.storage
        .from(bucket)
        .list(`${car.user_id}/${car.id}`)
      
      if (files && files.length > 0) {
        const paths = files.map(f => `${car.user_id}/${car.id}/${f.name}`)
        await supabase.storage.from(bucket).remove(paths)
      }
    }
  }

  // Hard delete the car rows (cascade handles all child tables)
  const { data: deleted, error: deleteError } = await supabase
    .from('cars')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff.toISOString())
    .select('id')

  if (deleteError) {
    console.error('Purge error:', deleteError)
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 })
  }

  const count = deleted?.length ?? 0
  console.log(`Purged ${count} cars and their storage files.`)

  // Log to analytics_events for monitoring
  if (count > 0) {
    await supabase.from('analytics_events').insert({
      event_name: 'cars_purged_nightly',
      properties: { count, run_at: new Date().toISOString() }
    })
  }

  return new Response(JSON.stringify({ purged: count }), { status: 200 })
})
*/


-- =============================================================================
-- ADDITIONAL CRON JOBS (future — document here for completeness)
-- =============================================================================

-- FUTURE: Weekly reminder notification check
-- When push notifications are added (post-PWA, native app):
-- select cron.schedule(
--   'weekly-reminder-check',
--   '0 9 * * 1',  -- 9 AM UTC every Monday
--   $$ SELECT notify_upcoming_reminders(); $$
-- );

-- FUTURE: Monthly analytics rollup (for API product materialized views)
-- select cron.schedule(
--   'monthly-analytics-rollup',
--   '0 2 1 * *',  -- 2 AM UTC on the 1st of each month
--   $$ REFRESH MATERIALIZED VIEW CONCURRENTLY api_parts_popularity; $$
-- );
