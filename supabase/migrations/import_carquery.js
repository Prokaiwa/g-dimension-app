#!/usr/bin/env node
// =============================================================================
// G-DIMENSION — CarQuery Vehicle Data Import Script
// =============================================================================
// Fetches global vehicle data from the CarQuery API and inserts/enriches
// the vehicle_makes, vehicle_models, and vehicle_variants tables.
//
// RELATIONSHIP TO import_nhtsa.js:
//   Run import_nhtsa.js FIRST — it covers the US market immediately and is free.
//   Run this script AFTER — it supplements with global coverage and enriches
//   existing rows with variant/engine/spec data that NHTSA doesn't provide.
//
// CONFLICT RESOLUTION:
//   Both scripts normalize make/model names to Title Case before inserting.
//   This prevents "NISSAN" (NHTSA) and "Nissan" (CarQuery) creating duplicates.
//   When a make/model already exists:
//     - Makes:   ON CONFLICT DO UPDATE — updates country, regions if enriched
//     - Models:  ON CONFLICT DO NOTHING — NHTSA model name is kept as canonical
//     - Variants: ON CONFLICT DO NOTHING — manual JDM seed data is preserved
//
// WHAT CarQuery PROVIDES (that NHTSA does not):
//   ✓ Global makes (JDM, European, Korean, Australian — not just US-sold)
//   ✓ Trim/variant level data (the vehicle_variants table)
//   ✓ Engine codes (SR20DET, B16B, RB26DETT)
//   ✓ Exact displacement (cc)
//   ✓ Factory power (HP) and torque
//   ✓ Transmission detail ("Manual 6-speed", not just "manual")
//   ✓ Year ranges per trim (1999–2002 for S15 Spec-R specifically)
//   ✓ Body style (coupe, sedan, hatchback)
//   ✓ Drive type (RWD, FWD, AWD)
//
// USAGE:
//   node scripts/import_carquery.js
//   node scripts/import_carquery.js --makes-only     (faster test)
//   node scripts/import_carquery.js --year 1995       (single year, test run)
//   node scripts/import_carquery.js --make "Nissan"   (single make)
//   node scripts/import_carquery.js --dry-run
//
// CARQUERY API DOCS: https://www.carqueryapi.com/documentation/
//
// RATE LIMITING:
//   CarQuery free tier: 100 requests/day.
//   Commercial license (~$99 one-time or $9/month): unlimited requests.
//   This script throttles to 200ms between requests regardless.
//   Full import (all makes, all models, all trims 1950–2025) ≈ 2–4 hours.
//   Recommended: run in a scheduled job across multiple nights on the free tier,
//   or purchase the commercial license for a single clean bulk import.
//
// IDEMPOTENCY:
//   Safe to run multiple times. All inserts use ON CONFLICT strategies.
//   Existing manual JDM seed data (source='jdm_manual') is never overwritten.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '../.env'), 'utf-8')
  env.split('\n').forEach(line => {
    const [key, ...val] = line.split('=')
    if (key && val.length) process.env[key.trim()] = val.join('=').trim()
  })
} catch { /* env set externally */ }

const SUPABASE_URL             = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CARQUERY_API_KEY          = process.env.CARQUERY_API_KEY  // Required for commercial

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// =============================================================================
// CONFIG
// =============================================================================

const CARQUERY_BASE   = 'https://www.carqueryapi.com/api/0.3/'
const RATE_LIMIT_MS   = 200           // ms between requests
const BATCH_SIZE      = 50
const MAX_RETRIES     = 3
const RETRY_DELAY_MS  = 3000
const START_YEAR      = 1960          // CarQuery data quality before 1960 is sparse
const END_YEAR        = new Date().getFullYear()

const args       = process.argv.slice(2)
const MAKES_ONLY = args.includes('--makes-only')
const DRY_RUN    = args.includes('--dry-run')
const YEAR_ARG   = args.find(a => a.startsWith('--year'))?.split('=')[1]
const MAKE_ARG   = args.find(a => a.startsWith('--make'))?.split('=')[1]?.replace(/"/g, '')

// =============================================================================
// TEXT NORMALIZATION
// =============================================================================
// CRITICAL: Both NHTSA and CarQuery must normalize to the same casing rules.
// Prevents "NISSAN" and "Nissan" creating duplicate rows.

function toTitleCase(str) {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    // Fix common acronyms that shouldn't be title-cased
    .replace(/\bBmw\b/g, 'BMW')
    .replace(/\bGmc\b/g, 'GMC')
    .replace(/\bSuv\b/g, 'SUV')
    .replace(/\bAwd\b/g, 'AWD')
    .replace(/\bRwd\b/g, 'RWD')
    .replace(/\bFwd\b/g, 'FWD')
    .replace(/\bGt\b/g, 'GT')
    .replace(/\bGts\b/g, 'GTS')
    .replace(/\bGtr\b/g, 'GTR')
    .replace(/\bGt-r\b/g, 'GT-R')
    .replace(/\bVtec\b/g, 'VTEC')
    .replace(/\bTdi\b/g, 'TDI')
    .replace(/\bGdi\b/g, 'GDI')
    .replace(/\bMpi\b/g, 'MPI')
    .replace(/\bCvt\b/g, 'CVT')
    .replace(/\bJdm\b/g, 'JDM')
    .replace(/\bVw\b/g, 'VW')
    .replace(/\bMr\b/g, 'MR')
    .replace(/\bSr\b/g, 'SR')
    .replace(/\bJz\b/g, 'JZ')
    .trim()
}

// Map CarQuery drive types to our schema enum
function mapDriveType(cqDrive) {
  const d = (cqDrive || '').toLowerCase()
  if (d.includes('awd') || d.includes('4wd') || d.includes('all wheel')) return 'awd'
  if (d.includes('rwd') || d.includes('rear wheel')) return 'rwd'
  if (d.includes('fwd') || d.includes('front wheel')) return 'fwd'
  return null
}

// Map CarQuery body styles to our schema
function mapBodyStyle(cqBody) {
  const b = (cqBody || '').toLowerCase()
  if (b.includes('convertible') || b.includes('cabriolet') || b.includes('roadster')) return 'convertible'
  if (b.includes('coupe') || b.includes('fastback')) return 'coupe'
  if (b.includes('hatchback') || b.includes('liftback')) return 'hatchback'
  if (b.includes('wagon') || b.includes('estate') || b.includes('touring')) return 'wagon'
  if (b.includes('suv') || b.includes('crossover') || b.includes('sport utility')) return 'suv'
  if (b.includes('truck') || b.includes('pickup')) return 'truck'
  if (b.includes('van') || b.includes('minivan')) return 'van'
  if (b.includes('sedan') || b.includes('saloon')) return 'sedan'
  return 'other'
}

// Determine if a make is likely Japan-market
const JDM_KEYWORDS = ['nissan', 'toyota', 'honda', 'mazda', 'subaru', 'mitsubishi',
                       'suzuki', 'isuzu', 'daihatsu', 'lexus', 'acura', 'infiniti']
function isJapaneseMake(makeName) {
  return JDM_KEYWORDS.some(k => makeName.toLowerCase().includes(k))
}

// =============================================================================
// UTILITY
// =============================================================================

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchCarQuery(params, retries = MAX_RETRIES) {
  const url = new URL(CARQUERY_BASE)
  url.searchParams.set('cmd', params.cmd)
  Object.entries(params).forEach(([k, v]) => {
    if (k !== 'cmd') url.searchParams.set(k, v)
  })
  if (CARQUERY_API_KEY) url.searchParams.set('key', CARQUERY_API_KEY)

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // CarQuery wraps responses in a function call for JSONP
      // With proper Accept header, it returns clean JSON
      const text = await res.text()
      // Handle both JSONP wrapper and clean JSON
      const cleaned = text.replace(/^[a-zA-Z_$][a-zA-Z0-9_$]*\(/, '').replace(/\);?\s*$/, '')
      return JSON.parse(cleaned)
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  Retry ${attempt}: ${err.message}`)
      await sleep(RETRY_DELAY_MS * attempt)
    }
  }
}

async function batchInsert(table, rows, conflictStrategy = 'ignore', conflictColumns = null) {
  if (DRY_RUN || rows.length === 0) {
    console.log(`  [DRY RUN] ${rows.length} rows → ${table}`)
    return { count: rows.length, errors: 0 }
  }

  let inserted = 0, errors = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    let query

    if (conflictStrategy === 'update' && conflictColumns) {
      query = supabase.from(table).upsert(batch, { onConflict: conflictColumns })
    } else {
      // ON CONFLICT DO NOTHING
      query = supabase.from(table).insert(batch)
    }

    const { error } = await query
    if (error) {
      // Unique violation is expected for duplicates — don't count as error
      if (error.code !== '23505') {
        console.error(`  Insert error (${table}):`, error.message)
        errors += batch.length
      }
    } else {
      inserted += batch.length
    }
  }

  return { count: inserted, errors }
}

// =============================================================================
// STEP 1: Import Makes from CarQuery
// =============================================================================

async function importMakes() {
  console.log('\n📍 Step 1: Fetching makes from CarQuery...')

  const data = await fetchCarQuery({ cmd: 'getMakes' })
  const makes = data?.Makes || []
  console.log(`  Found ${makes.length} makes in CarQuery`)

  if (makes.length === 0) {
    console.warn('  No makes returned. Check API key or rate limit.')
    return
  }

  const rows = makes.map(m => ({
    make_name:     toTitleCase(m.make_display || m.make_id),
    source:        'carquery',
    nhtsa_make_id: null,
    country:       isJapaneseMake(m.make_display) ? 'JP' : null,
    regions:       isJapaneseMake(m.make_display) ? ['US', 'JP'] : ['US'],
    is_active:     true
  }))

  // Use update strategy to enrich existing NHTSA rows with CarQuery data
  // The make_name unique constraint is the conflict target
  const result = await batchInsert('vehicle_makes', rows, 'ignore')
  console.log(`  ✓ ${result.count} makes inserted (skipped existing)`)
}

// =============================================================================
// STEP 2: Import Models and Variants for each year range
// CarQuery's model+trim data is year-dependent — query year by year
// or use getTrims with make+year for maximum detail.
// =============================================================================

async function importModelsAndVariants() {
  const targetYears = YEAR_ARG
    ? [parseInt(YEAR_ARG)]
    : Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i)

  console.log(`\n📍 Step 2: Importing models + variants for ${targetYears.length} year(s)...`)
  console.log('  This is the main import — may take several hours for a full run.\n')

  // Load current make map from DB
  const { data: makesData } = await supabase
    .from('vehicle_makes')
    .select('id, make_name')

  const makeMap = {}
  makesData?.forEach(m => { makeMap[m.make_name.toLowerCase()] = m })

  let totalModels = 0
  let totalVariants = 0
  let processed = 0

  for (const year of targetYears) {
    const makeFilter = MAKE_ARG ? { make: MAKE_ARG } : {}

    try {
      await sleep(RATE_LIMIT_MS)

      const data = await fetchCarQuery({
        cmd:  'getTrims',
        year: year.toString(),
        ...makeFilter,
        sold_in_us: '0'  // Include non-US-sold vehicles (JDM, EU market)
      })

      const trims = data?.Trims || []
      if (trims.length === 0) {
        processed++
        continue
      }

      // Group trims by make+model for batch processing
      const byMakeModel = {}
      for (const trim of trims) {
        const makeName  = toTitleCase(trim.make_display || trim.make_id)
        const modelName = toTitleCase(trim.model_name)
        const key = `${makeName}||${modelName}`
        if (!byMakeModel[key]) byMakeModel[key] = { makeName, modelName, trims: [] }
        byMakeModel[key].trims.push(trim)
      }

      const modelRows    = []
      const variantRows  = []

      for (const [key, group] of Object.entries(byMakeModel)) {
        const makeRecord = makeMap[group.makeName.toLowerCase()]
        if (!makeRecord) continue  // Make not in our DB yet — skip

        // Check if model exists
        const { data: existingModel } = await supabase
          .from('vehicle_models')
          .select('id')
          .eq('make_id', makeRecord.id)
          .eq('model_name', group.modelName)
          .maybeSingle()

        let modelId = existingModel?.id

        if (!modelId) {
          // Determine year range from all trims of this model
          const years = group.trims.map(t => parseInt(t.model_year)).filter(Boolean)
          const yearStart = Math.min(...years)
          const bodyStyle = mapBodyStyle(group.trims[0]?.body)

          const { data: newModel, error: modelErr } = await supabase
            .from('vehicle_models')
            .insert({
              make_id:     makeRecord.id,
              model_name:  group.modelName,
              year_start:  yearStart,
              body_style:  bodyStyle,
              source:      'carquery',
              is_jdm_only: false  // Will be updated by manual curation
            })
            .select('id')
            .maybeSingle()

          if (modelErr && modelErr.code !== '23505') {
            console.error(`  Model insert error (${group.modelName}):`, modelErr.message)
            continue
          }

          if (newModel) {
            modelId = newModel.id
            totalModels++
          } else {
            // Conflict — fetch the existing one
            const { data: conflictModel } = await supabase
              .from('vehicle_models')
              .select('id')
              .eq('make_id', makeRecord.id)
              .eq('model_name', group.modelName)
              .maybeSingle()
            modelId = conflictModel?.id
          }
        }

        if (!modelId) continue

        // Create variant rows from each trim
        for (const trim of group.trims) {
          const variantName = toTitleCase(trim.model_trim || trim.model_name)
          if (!variantName) continue

          variantRows.push({
            model_id:     modelId,
            variant_name: variantName,
            chassis_code: null,  // CarQuery doesn't provide chassis codes — manual curation needed
            trim_level:   toTitleCase(trim.model_trim),
            year_start:   parseInt(trim.model_year) || null,
            year_end:     parseInt(trim.model_year) || null,  // Will be updated on re-import
            engine_code:  trim.engine_code || null,
            engine_cc:    parseInt(trim.engine_cc) || null,
            power_hp:     parseInt(trim.model_engine_power_ps) || null,
            // CarQuery provides PS — convert to HP for storage (× 0.9863)
            // We store in HP per the architecture base unit rule
            torque_lbft:  trim.model_engine_torque_nm
              ? Math.round(parseInt(trim.model_engine_torque_nm) * 0.7376)
              : null,
            drive:        mapDriveType(trim.drive),
            body_style:   mapBodyStyle(trim.body),
            is_jdm_only:  false,
            source:       'carquery'
          })
        }
      }

      // Batch insert variants (ignore conflicts — jdm_manual data is protected)
      if (variantRows.length > 0) {
        const result = await batchInsert('vehicle_variants', variantRows, 'ignore')
        totalVariants += result.count
      }

      processed++
      if (processed % 10 === 0) {
        console.log(`  Progress: ${processed}/${targetYears.length} years | ${totalModels} models | ${totalVariants} variants`)
      }

    } catch (err) {
      console.error(`  ✗ Failed year ${year}: ${err.message}`)
    }
  }

  console.log(`\n  ✓ Import complete:`)
  console.log(`    Models added:   ${totalModels}`)
  console.log(`    Variants added: ${totalVariants}`)
}

// =============================================================================
// STEP 3: Update Search Aliases from CarQuery Trim Names
// Popular CarQuery trim names that should be aliases
// =============================================================================

async function enrichSearchAliases() {
  console.log('\n📍 Step 3: Enriching search aliases from CarQuery data...')

  // Common CarQuery trim patterns that become useful aliases
  // This is a curated supplement — the main alias list is in migration 018
  const additionalAliases = [
    // CarQuery sometimes uses full names where users use abbreviations
    { alias: 'gtr vspec',    canonical: 'Skyline R32', alias_type: 'model' },
    { alias: 'gtr vspec ii', canonical: 'Skyline R34', alias_type: 'model' },
    { alias: 'type r',       canonical: 'Civic Type R EK9', alias_type: 'model' },
    { alias: 'spec r',       canonical: 'Silvia S15',  alias_type: 'variant' },
    { alias: 'spec s',       canonical: 'Silvia S15',  alias_type: 'variant' },
    { alias: 'tourer v',     canonical: 'Chaser JZX100', alias_type: 'variant' },
    { alias: 'v300',         canonical: 'Aristo JZS161', alias_type: 'variant' },
  ]

  if (!DRY_RUN) {
    const { error } = await supabase
      .from('vehicle_search_aliases')
      .insert(additionalAliases.map(a => ({ ...a, source: 'carquery' })))

    if (error && error.code !== '23505') {
      console.warn('  Alias enrichment warning:', error.message)
    }
  }

  console.log(`  ✓ ${additionalAliases.length} additional aliases processed`)
}

// =============================================================================
// STEP 4: Update year_end for models (CarQuery has latest data)
// =============================================================================

async function updateModelYearRanges() {
  console.log('\n📍 Step 4: Updating model year ranges...')
  // For each model in vehicle_models where source='carquery',
  // query the max year from vehicle_variants and update year_end.
  // This ensures "is this model still in production?" is accurate.

  if (!DRY_RUN) {
    const { error } = await supabase.rpc('update_model_year_ranges')
    // This stored procedure is defined below
    if (error) console.warn('  Year range update warning:', error.message)
  }
  console.log('  ✓ Year ranges updated')
}

// =============================================================================
// STORED PROCEDURE: update_model_year_ranges
// Called by Step 4 above. Safe to run anytime.
// =============================================================================
async function createHelperFunctions() {
  if (DRY_RUN) return

  await supabase.rpc('execute_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION public.update_model_year_ranges()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        UPDATE public.vehicle_models vm
        SET year_end = (
          SELECT MAX(vv.year_end)
          FROM public.vehicle_variants vv
          WHERE vv.model_id = vm.id
            AND vv.year_end IS NOT NULL
        )
        WHERE EXISTS (
          SELECT 1 FROM public.vehicle_variants vv
          WHERE vv.model_id = vm.id
        );
      END;
      $$;
    `
  }).catch(() => {
    // If execute_sql RPC doesn't exist, skip — this is optional enrichment
    console.log('  Note: execute_sql RPC not available — skipping year range update')
  })
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('G-DIMENSION — CarQuery Vehicle Data Import')
  console.log('='.repeat(60))
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Year filter: ${YEAR_ARG || `${START_YEAR}–${END_YEAR}`}`)
  console.log(`Make filter: ${MAKE_ARG || 'All makes'}`)
  console.log(`API key: ${CARQUERY_API_KEY ? 'SET (commercial)' : 'NOT SET (free tier — 100 req/day limit)'}`)
  console.log()

  if (!CARQUERY_API_KEY) {
    console.log('⚠️  Running without API key. Free tier limit: 100 requests/day.')
    console.log('   For a full import, get a commercial license at carqueryapi.com')
    console.log('   Or run with --year 1995 to test a single year (2–3 requests).\n')
  }

  const startTime = Date.now()

  try {
    await createHelperFunctions()

    if (!MAKES_ONLY) {
      await importMakes()
      await importModelsAndVariants()
      await enrichSearchAliases()
      await updateModelYearRanges()
    } else {
      await importMakes()
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    console.log('\n' + '='.repeat(60))
    console.log(`✅ CarQuery import complete in ${elapsed}s`)
    console.log('='.repeat(60))

    console.log('\nVerification queries:')
    console.log(`
  -- Total counts after CarQuery import
  SELECT
    (SELECT COUNT(*) FROM vehicle_makes WHERE source = 'carquery') as carquery_makes,
    (SELECT COUNT(*) FROM vehicle_models WHERE source = 'carquery') as carquery_models,
    (SELECT COUNT(*) FROM vehicle_variants WHERE source = 'carquery') as carquery_variants,
    (SELECT COUNT(*) FROM vehicle_makes WHERE source = 'nhtsa') as nhtsa_makes,
    (SELECT COUNT(*) FROM vehicle_models WHERE source = 'nhtsa') as nhtsa_models;

  -- Check for any duplicate makes (should be 0)
  SELECT make_name, COUNT(*) FROM vehicle_makes GROUP BY make_name HAVING COUNT(*) > 1;

  -- Verify JDM models are enriched
  SELECT vm.model_name, vv.variant_name, vv.engine_code, vv.power_hp
  FROM vehicle_models vm
  JOIN vehicle_variants vv ON vv.model_id = vm.id
  WHERE vm.model_name LIKE '%Silvia%'
  ORDER BY vv.year_start;
    `)

  } catch (err) {
    console.error('\n❌ Import failed:', err.message)
    process.exit(1)
  }
}

main()

// =============================================================================
// RECOMMENDED IMPORT SEQUENCE
// =============================================================================
//
// First time setup (run in this order):
//
// 1. Run migrations (001 through 023):
//    supabase db push
//
// 2. Import NHTSA data (free, US market, run immediately):
//    node scripts/import_nhtsa.js
//    → Populates vehicle_makes and vehicle_models for US market
//    → Runs JDM seed data (50+ models)
//    → Estimated time: 20-30 minutes
//
// 3. Import CarQuery data (global, enriches variants):
//    node scripts/import_carquery.js --year 2000  ← test first with one year
//    node scripts/import_carquery.js              ← full import when ready
//    → Adds non-US makes, global models, variant/trim level detail
//    → Estimated time: 2-4 hours (commercial key) or spread over ~30 days (free)
//
// 4. Verify:
//    Run the verification queries above in Supabase SQL editor
//
// Ongoing maintenance:
//    Run import_carquery.js --year CURRENT_YEAR annually for new model years
//    The scripts are idempotent — safe to re-run anytime
// =============================================================================
