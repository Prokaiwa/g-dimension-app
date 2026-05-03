// =============================================================================
// G-DIMENSION — Edge Function: nightly-purge
// =============================================================================
// THE DEFINITIVE PURGE IMPLEMENTATION — replaces pg_cron Option A entirely.
//
// WHY EDGE FUNCTION OVER pg_cron:
//   pg_cron can only run SQL. It deletes DB rows but cannot touch Storage files.
//   This means orphaned photos and documents pile up in your Storage buckets,
//   costing money indefinitely. At 500 users each with 50+ photos, that's
//   tens of thousands of orphaned files within the first year.
//
//   The Edge Function does BOTH:
//   1. Collects storage paths from all affected cars before deletion
//   2. Deletes the Storage files
//   3. Hard-deletes the DB rows (cascade handles all child tables)
//   4. Logs the result to analytics_events for monitoring
//
// SCHEDULE:
//   3:00 AM UTC daily via Supabase Cron
//   Deploy: supabase functions deploy nightly-purge --schedule "0 3 * * *"
//   Or via Dashboard → Edge Functions → Schedules → New Schedule
//
// STORAGE BUCKETS CLEANED:
//   car-photos      → garage_photo_url, showcase_photo_url
//   job-photos      → all job_photos rows for the car
//   timeline-photos → timeline_photo_url, origin entry photo
//   receipts        → all receipt files for the car (PRIVATE BUCKET)
//   car-documents   → all document files for the car (PRIVATE BUCKET)
//
// SAFETY:
//   - Reads cars with deleted_at < now() - 7 days (the 7-day recovery window)
//   - Does NOT touch any car that was soft-deleted less than 7 days ago
//   - Storage deletion is attempted per bucket — a failure in one bucket
//     does not block DB deletion (logged separately)
//   - DB deletion uses cascade — child tables clean up automatically
//   - Entire run is logged to analytics_events for monitoring
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKETS_TO_CLEAN = [
  'car-photos',
  'job-photos',
  'timeline-photos',
  'receipts',
  'car-documents'
]

const CUTOFF_DAYS = 7

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Service role: bypasses RLS
  )

  const runStart = new Date()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - CUTOFF_DAYS)

  console.log(`[nightly-purge] Starting run at ${runStart.toISOString()}`)
  console.log(`[nightly-purge] Purging cars deleted before ${cutoff.toISOString()}`)

  let storageErrors: string[] = []
  let purgedCount = 0

  try {
    // =========================================================
    // STEP 1: Identify cars to purge
    // =========================================================
    const { data: carsToDelete, error: fetchError } = await supabase
      .from('cars')
      .select('id, user_id, garage_photo_url, showcase_photo_url, nickname')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff.toISOString())

    if (fetchError) {
      throw new Error(`Failed to fetch cars for purge: ${fetchError.message}`)
    }

    if (!carsToDelete || carsToDelete.length === 0) {
      console.log('[nightly-purge] No cars to purge today.')
      return new Response(JSON.stringify({ purged: 0, storage_errors: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`[nightly-purge] Found ${carsToDelete.length} car(s) to purge`)

    // =========================================================
    // STEP 2: Clean Storage for each car
    // =========================================================
    for (const car of carsToDelete) {
      const basePath = `${car.user_id}/${car.id}`
      console.log(`[nightly-purge] Cleaning storage for car ${car.id} (${car.nickname})`)

      for (const bucket of BUCKETS_TO_CLEAN) {
        try {
          // List all files in this car's folder in this bucket
          const { data: files, error: listError } = await supabase.storage
            .from(bucket)
            .list(basePath, { limit: 1000 })

          if (listError) {
            // Bucket may not have any files — not an error
            console.warn(`[nightly-purge] List warning (${bucket}/${basePath}): ${listError.message}`)
            continue
          }

          if (!files || files.length === 0) continue

          // Build full paths for deletion
          const filePaths = files.map(f => `${basePath}/${f.name}`)

          const { error: deleteError } = await supabase.storage
            .from(bucket)
            .remove(filePaths)

          if (deleteError) {
            const errMsg = `Storage delete failed (${bucket}/${basePath}): ${deleteError.message}`
            console.error(`[nightly-purge] ${errMsg}`)
            storageErrors.push(errMsg)
            // Continue — don't let storage errors block DB deletion
          } else {
            console.log(`[nightly-purge] Deleted ${filePaths.length} files from ${bucket}/${basePath}`)
          }

          // Also check nested folders (session/job sub-paths in job-photos)
          for (const file of files) {
            if (file.metadata === null) {
              // This is a folder — recurse one level
              const { data: subFiles } = await supabase.storage
                .from(bucket)
                .list(`${basePath}/${file.name}`, { limit: 1000 })

              if (subFiles && subFiles.length > 0) {
                const subPaths = subFiles.map(f => `${basePath}/${file.name}/${f.name}`)
                await supabase.storage.from(bucket).remove(subPaths)
              }
            }
          }

        } catch (bucketErr) {
          const errMsg = `Unexpected error cleaning ${bucket} for car ${car.id}: ${bucketErr}`
          console.error(`[nightly-purge] ${errMsg}`)
          storageErrors.push(errMsg)
        }
      }
    }

    // =========================================================
    // STEP 3: Hard delete car rows (cascade handles children)
    // =========================================================
    // ON DELETE CASCADE covers: sessions → jobs → timeline_entries →
    //   job_photos → receipts → car_contacts → car_documents →
    //   car_reminders → audit_log rows referencing the car

    const { data: deleted, error: deleteError } = await supabase
      .from('cars')
      .delete()
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff.toISOString())
      .select('id')

    if (deleteError) {
      throw new Error(`Hard delete failed: ${deleteError.message}`)
    }

    purgedCount = deleted?.length ?? 0
    console.log(`[nightly-purge] Hard deleted ${purgedCount} car row(s) and all cascaded children`)

    // =========================================================
    // STEP 4: Log the result
    // =========================================================
    await supabase.from('analytics_events').insert({
      user_id: null,  // System event
      event_name: 'nightly_purge_completed',
      properties: {
        purged_count:    purgedCount,
        storage_errors:  storageErrors.length,
        error_details:   storageErrors.length > 0 ? storageErrors : null,
        run_duration_ms: Date.now() - runStart.getTime(),
        cutoff_date:     cutoff.toISOString()
      },
      platform: 'server'
    })

    // =========================================================
    // STEP 5: Alert if there were storage errors
    // =========================================================
    // Future: add Slack/email webhook here if storageErrors.length > 0
    // For now, errors are visible in Edge Function logs in Supabase dashboard

    const result = {
      purged: purgedCount,
      storage_errors: storageErrors.length,
      run_duration_ms: Date.now() - runStart.getTime()
    }

    console.log(`[nightly-purge] Complete:`, result)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[nightly-purge] Fatal error:', err)

    // Log failure to analytics
    await supabase.from('analytics_events').insert({
      user_id: null,
      event_name: 'nightly_purge_failed',
      properties: {
        error: String(err),
        purged_before_failure: purgedCount,
        run_duration_ms: Date.now() - runStart.getTime()
      },
      platform: 'server'
    }).catch(() => {}) // Don't let logging failure mask the real error

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

// =============================================================================
// DEPLOYMENT INSTRUCTIONS
// =============================================================================
//
// 1. Install Supabase CLI:
//    npm install -g supabase
//
// 2. Link to your project:
//    supabase login
//    supabase link --project-ref <your-project-ref>
//
// 3. Create the function:
//    supabase functions new nightly-purge
//    (Replace the generated index.ts with this file)
//
// 4. Deploy with cron schedule:
//    supabase functions deploy nightly-purge --schedule "0 3 * * *"
//
// 5. Verify in Dashboard → Edge Functions → nightly-purge → Logs
//
// 6. Test manually (one-time):
//    supabase functions invoke nightly-purge
//    (Safe — only purges cars with deleted_at > 7 days ago)
//
// ENVIRONMENT VARIABLES (auto-provided by Supabase, no manual setup needed):
//   SUPABASE_URL              → your project URL
//   SUPABASE_SERVICE_ROLE_KEY → service role key (bypasses RLS)
// =============================================================================
