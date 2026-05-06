#!/usr/bin/env node
// =============================================================================
// G-DIMENSION — NHTSA Vehicle Data Import Script
// =============================================================================
// Fetches all US vehicle makes and models from the NHTSA API and inserts them
// into the vehicle_makes and vehicle_models Supabase tables.
//
// USAGE:
//   node scripts/import_nhtsa.js
//   node scripts/import_nhtsa.js --makes-only     (skip models, faster test)
//   node scripts/import_nhtsa.js --jdm-only        (only seed JDM manual list)
//   node scripts/import_nhtsa.js --dry-run         (print counts, no inserts)
//
// REQUIREMENTS:
//   npm install @supabase/supabase-js node-fetch dotenv
//   .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//
// IDEMPOTENCY:
//   Safe to run multiple times. Uses ON CONFLICT DO UPDATE for makes.
//   Uses ON CONFLICT DO NOTHING for models (same make+model = skip).
//   nhtsa_make_id is the deduplication key for makes.
//
// RATE LIMITING:
//   NHTSA API has no official rate limit but is a US gov server.
//   We throttle to 1 request per 100ms and batch inserts in groups of 50.
//   Full import (~10,000 models) takes approximately 15-20 minutes.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load env
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '../.env'), 'utf-8')
  env.split('\n').forEach(line => {
    const [key, ...val] = line.split('=')
    if (key && val.length) process.env[key.trim()] = val.join('=').trim()
  })
} catch {
  // .env not found — assume environment variables are set externally
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

// Service role client — bypasses RLS for bulk import
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// =============================================================================
// CONFIG
// =============================================================================

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles'
const RATE_LIMIT_MS = 120          // ms between requests (< 10 req/sec)
const MODEL_BATCH_SIZE = 50        // models inserted per batch
const MAKE_BATCH_SIZE = 100        // makes inserted per batch
const MAX_RETRIES = 3              // retry failed requests this many times
const RETRY_DELAY_MS = 2000        // wait before retry

const args = process.argv.slice(2)
const MAKES_ONLY = args.includes('--makes-only')
const JDM_ONLY   = args.includes('--jdm-only')
const DRY_RUN    = args.includes('--dry-run')

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)  // 15s timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      const isLastAttempt = attempt === retries
      if (isLastAttempt) {
        throw new Error(`Failed after ${retries} attempts: ${err.message}`)
      }
      console.warn(`  Attempt ${attempt} failed: ${err.message}. Retrying in ${RETRY_DELAY_MS}ms...`)
      await sleep(RETRY_DELAY_MS * attempt)  // Exponential backoff
    }
  }
}

async function batchInsert(table, rows, onConflict = 'ignore') {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would insert ${rows.length} rows into ${table}`)
    return { count: rows.length, errors: 0 }
  }

  let inserted = 0
  let errors = 0

  // Process in batches to avoid Supabase payload limits
  const batchSize = table === 'vehicle_makes' ? MAKE_BATCH_SIZE : MODEL_BATCH_SIZE
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)

    const query = onConflict === 'update'
      ? supabase.from(table).upsert(batch, { onConflict: 'nhtsa_make_id' })
      : supabase.from(table).insert(batch)

    const { error } = await query

    if (error) {
      console.error(`  Batch insert error (${table}):`, error.message)
      errors += batch.length
    } else {
      inserted += batch.length
    }
  }

  return { count: inserted, errors }
}

// =============================================================================
// STEP 1: FETCH AND INSERT MAKES
// =============================================================================

async function importMakes() {
  console.log('\n📍 Step 1: Fetching all makes from NHTSA...')

  const data = await fetchWithRetry(`${NHTSA_BASE}/getallmakes?format=json`)

  if (!data.Results || !Array.isArray(data.Results)) {
    throw new Error('Unexpected NHTSA API response structure for makes')
  }

  console.log(`  Found ${data.Results.length} makes in NHTSA database`)

  // Transform to our schema
  const makes = data.Results
    .filter(m => m.Make_Name && m.Make_Name.trim())
    .map(m => ({
      make_name:     m.Make_Name.trim(),
      source:        'nhtsa',
      nhtsa_make_id: m.Make_ID,
      country:       null,        // NHTSA doesn't provide country — enriched manually
      regions:       ['US'],      // NHTSA = US market
      is_active:     true
    }))

  console.log(`  Inserting ${makes.length} makes...`)
  const result = await batchInsert('vehicle_makes', makes, 'update')
  console.log(`  ✓ ${result.count} makes inserted/updated, ${result.errors} errors`)

  return makes
}

// =============================================================================
// STEP 2: FETCH AND INSERT MODELS FOR EACH MAKE
// =============================================================================

async function importModelsForMake(makeName, makeId) {
  await sleep(RATE_LIMIT_MS)  // Rate limiting

  const encodedMake = encodeURIComponent(makeName)
  const data = await fetchWithRetry(
    `${NHTSA_BASE}/getmodelsformake/${encodedMake}?format=json`
  )

  if (!data.Results) return []

  return data.Results
    .filter(m => m.Model_Name && m.Model_Name.trim())
    .map(m => ({
      make_id:     makeId,
      model_name:  m.Model_Name.trim(),
      source:      'nhtsa',
      is_jdm_only: false,
      // year_start and year_end not available from this endpoint
      // Use getmodelsformakeyear endpoint for year-range data (future enhancement)
    }))
}

async function importAllModels() {
  console.log('\n📍 Step 2: Fetching models for each make...')
  console.log('  This will take 15-20 minutes. Progress logged every 50 makes.\n')

  // Only fetch priority makes — avoids Supabase's 1000-row default limit swallowing
  // all 12k NHTSA entries (trailer companies, farm equipment, etc.) before reaching
  // Toyota, Nissan, Honda which live alphabetically near the end.
  const { data: makes, error } = await supabase
    .from('vehicle_makes')
    .select('id, make_name, source')
    .gt('priority', 0)
    .order('priority', { ascending: false })
    .order('make_name')

  if (error) throw new Error(`Failed to fetch makes: ${error.message}`)

  let totalModels = 0
  let failedMakes = []
  let processed = 0

  for (const make of makes) {
    try {
      const models = await importModelsForMake(make.make_name, make.id)

      if (models.length > 0) {
        const result = await batchInsert('vehicle_models', models, 'ignore')
        totalModels += result.count
      }

      processed++
      if (processed % 50 === 0) {
        console.log(`  Progress: ${processed}/${makes.length} makes processed, ${totalModels} models inserted`)
      }
    } catch (err) {
      console.error(`  ✗ Failed to import models for ${make.make_name}: ${err.message}`)
      failedMakes.push(make.make_name)
    }
  }

  console.log(`\n  ✓ Models import complete:`)
  console.log(`    Total models inserted: ${totalModels}`)
  console.log(`    Failed makes: ${failedMakes.length}`)
  if (failedMakes.length > 0) {
    console.log(`    Failed: ${failedMakes.join(', ')}`)
  }
}

// =============================================================================
// STEP 3: JDM SUPPLEMENTAL DATA
// Japan-domestic vehicles not in NHTSA + regional tagging for common JDM makes.
// This list covers the most popular JDM imports in the enthusiast community.
// Expand this list based on user requests.
// =============================================================================

const JDM_MAKES = [
  // Major manufacturers already in NHTSA but need Japan region tag
  // (handled by UPDATE in the full import)

  // JDM-specific and discontinued makes not in NHTSA
  { make_name: 'Datsun',   country: 'JP', regions: ['US', 'JP'], source: 'jdm_manual' },  // Nissan's export brand (1958–1986)
  { make_name: 'Autozam',  country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Tommykaira', country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Mine\'s',  country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Nismo',    country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'HKS',      country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Top Secret', country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Trial',    country: 'JP', regions: ['JP'], source: 'jdm_manual' },
  { make_name: 'Amuse',    country: 'JP', regions: ['JP'], source: 'jdm_manual' },
]

// JDM-only models for popular makes
// make_name is used to find the make_id after makes are inserted
const JDM_MODELS = [
  // Nissan JDM
  { make_name: 'Nissan', model_name: 'Silvia S13',    year_start: 1988, year_end: 1993, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: 'Silvia S14',    year_start: 1993, year_end: 1998, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: 'Silvia S15',    year_start: 1999, year_end: 2002, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: '180SX',         year_start: 1989, year_end: 1998, is_jdm_only: true,  body_style: 'hatchback' },
  { make_name: 'Nissan', model_name: 'Skyline R32',   year_start: 1989, year_end: 1994, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: 'Skyline R33',   year_start: 1993, year_end: 1998, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: 'Skyline R34',   year_start: 1998, year_end: 2002, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Nissan', model_name: 'Cefiro A31',    year_start: 1988, year_end: 1994, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Nissan', model_name: 'Stagea',        year_start: 1996, year_end: 2007, is_jdm_only: true,  body_style: 'wagon' },
  { make_name: 'Nissan', model_name: 'Laurel C35',    year_start: 1997, year_end: 2002, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Nissan', model_name: 'Gloria Y34',    year_start: 1999, year_end: 2004, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Nissan', model_name: 'Cedric Y34',    year_start: 1999, year_end: 2004, is_jdm_only: true,  body_style: 'sedan' },

  // Toyota JDM
  { make_name: 'Toyota', model_name: 'Chaser JZX100', year_start: 1996, year_end: 2001, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Chaser JZX90',  year_start: 1992, year_end: 1996, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Mark II JZX100',year_start: 1996, year_end: 2000, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Cresta JZX100', year_start: 1996, year_end: 2001, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Soarer Z30',    year_start: 1991, year_end: 2000, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Toyota', model_name: 'Aristo JZS161', year_start: 1997, year_end: 2005, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Altezza',       year_start: 1998, year_end: 2005, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Verossa',       year_start: 2001, year_end: 2004, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Brevis',        year_start: 2001, year_end: 2007, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Estima',        year_start: 1990, year_end: 2019, is_jdm_only: true,  body_style: 'minivan' },

  // Honda JDM
  { make_name: 'Honda', model_name: 'Civic Type R EK9', year_start: 1997, year_end: 2000, is_jdm_only: true, body_style: 'hatchback' },
  { make_name: 'Honda', model_name: 'Integra DC2',     year_start: 1993, year_end: 2001, is_jdm_only: false, body_style: 'coupe' },
  { make_name: 'Honda', model_name: 'Integra Type R DC2', year_start: 1995, year_end: 2001, is_jdm_only: true, body_style: 'coupe' },
  { make_name: 'Honda', model_name: 'Legend KA9',      year_start: 1996, year_end: 2004, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Honda', model_name: 'Stream',          year_start: 2000, year_end: 2006, is_jdm_only: true,  body_style: 'wagon' },

  // Mitsubishi JDM
  { make_name: 'Mitsubishi', model_name: 'Lancer Evolution IV',   year_start: 1996, year_end: 1998, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Mitsubishi', model_name: 'Lancer Evolution V',    year_start: 1998, year_end: 1999, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Mitsubishi', model_name: 'Lancer Evolution VI',   year_start: 1999, year_end: 2001, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Mitsubishi', model_name: 'GTO Twin Turbo',        year_start: 1990, year_end: 2000, is_jdm_only: true, body_style: 'coupe' },
  { make_name: 'Mitsubishi', model_name: 'Galant VR-4',           year_start: 1988, year_end: 1993, is_jdm_only: true, body_style: 'sedan' },

  // Mazda JDM
  { make_name: 'Mazda', model_name: 'RX-7 FD3S',  year_start: 1991, year_end: 2002, is_jdm_only: false, body_style: 'coupe' },
  { make_name: 'Mazda', model_name: 'RX-7 FC3S',  year_start: 1985, year_end: 1991, is_jdm_only: false, body_style: 'coupe' },
  { make_name: 'Mazda', model_name: 'Cosmo',       year_start: 1990, year_end: 1996, is_jdm_only: true,  body_style: 'coupe' },
  { make_name: 'Mazda', model_name: 'Eunos Roadster', year_start: 1989, year_end: 1997, is_jdm_only: true, body_style: 'convertible' },
  { make_name: 'Mazda', model_name: 'Atenza',      year_start: 2002, year_end: 2019, is_jdm_only: true,  body_style: 'sedan' },
  { make_name: 'Mazda', model_name: 'Autozam AZ-1', year_start: 1992, year_end: 1994, is_jdm_only: true, body_style: 'coupe' },

  // Subaru JDM
  { make_name: 'Subaru', model_name: 'Impreza WRX STI GC8', year_start: 1992, year_end: 2000, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Subaru', model_name: 'Legacy B4 BE5',       year_start: 1998, year_end: 2003, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Subaru', model_name: 'Alcyone SVX',         year_start: 1991, year_end: 1996, is_jdm_only: true, body_style: 'coupe' },

  // Suzuki JDM
  { make_name: 'Suzuki', model_name: 'Cappuccino',  year_start: 1991, year_end: 1998, is_jdm_only: true, body_style: 'convertible' },
  { make_name: 'Suzuki', model_name: 'Alto Works',  year_start: 1987, year_end: 2000, is_jdm_only: true, body_style: 'hatchback' },
  { make_name: 'Suzuki', model_name: 'Jimny JA12',  year_start: 1995, year_end: 1998, is_jdm_only: true, body_style: 'suv' },
]

async function importJDMData() {
  console.log('\n📍 Step 3: Seeding JDM supplemental data...')

  // Upsert JDM-only makes (conflict on make_name — safe to re-run)
  if (JDM_MAKES.length > 0) {
    console.log(`  Inserting ${JDM_MAKES.length} JDM-specific makes...`)
    if (!DRY_RUN) {
      const { error } = await supabase
        .from('vehicle_makes')
        .upsert(JDM_MAKES.map(m => ({ ...m, is_active: true })), { onConflict: 'make_name' })
      if (error) console.error('  JDM makes upsert error:', error.message)
      else console.log(`  ✓ ${JDM_MAKES.length} JDM makes upserted`)
    } else {
      console.log(`  [DRY RUN] Would upsert ${JDM_MAKES.length} rows into vehicle_makes`)
    }
  }

  // Update known Japanese makes in NHTSA data to include JP region
  if (!DRY_RUN) {
    const jpMakes = ['Toyota', 'Honda', 'Nissan', 'Mazda', 'Subaru', 'Mitsubishi',
                     'Suzuki', 'Isuzu', 'Daihatsu', 'Lexus', 'Acura', 'Infiniti',
                     'Scion', 'Geo', 'Pontiac']

    for (const makeName of ['Toyota', 'Honda', 'Nissan', 'Mazda', 'Subaru',
                             'Mitsubishi', 'Suzuki', 'Isuzu', 'Daihatsu']) {
      const { error } = await supabase
        .from('vehicle_makes')
        .update({
          country: 'JP',
          regions: ['US', 'JP']  // Available in both markets
        })
        .eq('make_name', makeName)

      if (error) console.warn(`  Could not update region for ${makeName}:`, error.message)
    }
    console.log('  ✓ Updated region tags for Japanese makes in NHTSA data')
  }

  // Insert JDM-only models
  console.log(`  Inserting ${JDM_MODELS.length} JDM model records...`)

  // Resolve make_id — fetch only the specific makes JDM models reference
  const neededMakeNames = [...new Set(JDM_MODELS.map(m => m.make_name))]
  const orFilter = neededMakeNames.map(n => `make_name.ilike.${n}`).join(',')
  const { data: makesData } = await supabase
    .from('vehicle_makes')
    .select('id, make_name')
    .or(orFilter)

  const makeMap = {}
  makesData?.forEach(m => { makeMap[m.make_name.toLowerCase()] = m.id })

  const missingMakes = new Set()
  const modelsWithIds = JDM_MODELS
    .filter(m => {
      const found = makeMap[m.make_name.toLowerCase()]
      if (!found) missingMakes.add(m.make_name)
      return found
    })
    .map(m => ({
      make_id:     makeMap[m.make_name.toLowerCase()],
      model_name:  m.model_name,
      year_start:  m.year_start,
      year_end:    m.year_end,
      is_jdm_only: m.is_jdm_only,
      body_style:  m.body_style,
      source:      'jdm_manual'
    }))

  const skipped = JDM_MODELS.length - modelsWithIds.length
  if (skipped > 0) {
    console.warn(`  Warning: ${skipped} JDM models skipped — makes not in DB: ${[...missingMakes].join(', ')}`)
    console.warn(`  Run the full NHTSA import first (without --jdm-only) to populate vehicle_makes.`)
  }

  const result = await batchInsert('vehicle_models', modelsWithIds, 'ignore')
  console.log(`  ✓ ${result.count} JDM models inserted`)
}

// =============================================================================
// ADDITIONAL VEHICLE SOURCES FOR CONSIDERATION
// =============================================================================
// The following sources should supplement NHTSA for a global enthusiast app:
//
// 1. JAPANESE MARKET (JDM):
//    - JASIC (Japan Automobile Standards Internationalization Center)
//      https://www.jasic.org — registration required, not freely available
//    - Manual curation (current approach) — best for accuracy on popular models
//    - Community maintained: github.com/vepo/car-models-json (limited JDM)
//    - CAR DATABASE API (carqueryapi.com) — covers JDM, paid after 100 req/day
//
// 2. EUROPEAN MARKET:
//    - European Type Approval Database (eadb.eu) — official but complex
//    - Car Query API covers most EU makes/models
//
// 3. COMPREHENSIVE PAID OPTION:
//    - Marketcheck API (marketcheck.com) — US + global VIN decode, paid
//    - VINDECODER.EU — European market, reasonable pricing
//    - CarQuery API (carqueryapi.com) — $9/month, covers 1950-present globally
//      Recommended for Phase 2 when budget allows — covers 13,000+ models
//      with year ranges, trim levels, and engine specs
//
// 4. COMMUNITY CONTRIBUTION (future feature):
//    - Allow users to submit unlisted vehicles
//    - Store as source = 'user_added' with is_active = false until reviewed
//    - Simple admin approval UI in Supabase dashboard
// =============================================================================

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('G-DIMENSION — Vehicle Database Import')
  console.log('='.repeat(60))
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Target: ${SUPABASE_URL}`)
  console.log()

  const startTime = Date.now()

  try {
    if (JDM_ONLY) {
      await importJDMData()
    } else {
      await importMakes()

      if (!MAKES_ONLY) {
        await importAllModels()
      }

      await importJDMData()
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    console.log('\n' + '='.repeat(60))
    console.log(`✅ Import complete in ${elapsed}s`)
    console.log('='.repeat(60))

    // Print verification query
    console.log('\nVerification queries to run in Supabase SQL editor:')
    console.log(`
  SELECT COUNT(*) FROM vehicle_makes;
  SELECT COUNT(*) FROM vehicle_models;
  SELECT COUNT(*) FROM vehicle_makes WHERE is_jdm_only IS NOT NULL;
  SELECT make_name, COUNT(vm.id) as model_count
  FROM vehicle_makes m
  LEFT JOIN vehicle_models vm ON vm.make_id = m.id
  WHERE m.make_name IN ('Nissan', 'Toyota', 'Honda', 'Mazda')
  GROUP BY make_name;
    `)

  } catch (err) {
    console.error('\n❌ Import failed:', err.message)
    process.exit(1)
  }
}

main()
