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
//   node scripts/import_nhtsa.js --jdm-only        (only seed supplemental JDM + US muscle lists)
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

// Vehicle types we KEEP — passenger cars, trucks, and SUVs/vans (MPV).
// Deliberately EXCLUDES motorcycle, trailer, bus, lsv, incomplete and off-road.
// The plain getmodelsformake endpoint returns EVERY vehicle type a make has ever
// produced, which is how ~1,100 motorcycles/ATVs/trailers contaminated the first
// pull (Honda/BMW/Suzuki bikes, Eagle/Hudson trailers, hearse/bus chassis).
// Filtering by vehicle type at fetch time prevents it. Verified against vPIC:
// getmodelsformakeyear accepts a /vehicletype/<type> segment with no model year,
// e.g. Honda → car:14, truck:2, mpv:10, motorcycle:304 (the 304 are now excluded).
const KEPT_VEHICLE_TYPES = ['car', 'truck', 'mpv']

async function importModelsForMake(makeName, makeId) {
  const encodedMake = encodeURIComponent(makeName)
  const seen = new Set()
  const models = []

  // One request per kept vehicle type; merge + de-dupe (e.g. Accord appears under
  // both 'car' and 'mpv'). De-dupe is case-insensitive on the model name.
  for (const vtype of KEPT_VEHICLE_TYPES) {
    await sleep(RATE_LIMIT_MS)  // rate limit each sub-request
    const data = await fetchWithRetry(
      `${NHTSA_BASE}/getmodelsformakeyear/make/${encodedMake}/vehicletype/${vtype}?format=json`
    )
    if (!data.Results) continue

    for (const m of data.Results) {
      const name = m.Model_Name && m.Model_Name.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      models.push({
        make_id:     makeId,
        model_name:  name,
        source:      'nhtsa',
        is_jdm_only: false,
        // year_start/year_end not available from this endpoint
      })
    }
  }

  return models
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

// Supplemental manual model lists.
//
// CONVENTION: model_name = canonical FAMILY name. Chassis / generation (R34, S15,
// JZX100, GC8, DC2…) is NOT baked into the name — it lives on the car via
// cars.chassis_code / variant / trim. Generations are NOT separate rows. Models
// that NHTSA already returns at family level (RX-7, Lancer Evolution, Galant,
// WRX/Impreza, SVX, Legacy, Civic/Civic Type R, 3000GT) are intentionally omitted
// to avoid duplicates. make_name resolves the make_id after makes are inserted.
const JDM_MODELS = [
  // Nissan JDM
  { make_name: 'Nissan', model_name: 'Silvia',  year_start: 1988, year_end: 2002, is_jdm_only: true, body_style: 'coupe' },      // S13/S14/S15
  { make_name: 'Nissan', model_name: '180SX',   year_start: 1989, year_end: 1998, is_jdm_only: true, body_style: 'hatchback' },
  { make_name: 'Nissan', model_name: 'Skyline', year_start: 1989, year_end: 2002, is_jdm_only: true, body_style: 'coupe' },      // R32/R33/R34
  { make_name: 'Nissan', model_name: 'Cefiro',  year_start: 1988, year_end: 1994, is_jdm_only: true, body_style: 'sedan' },      // A31
  { make_name: 'Nissan', model_name: 'Stagea',  year_start: 1996, year_end: 2007, is_jdm_only: true, body_style: 'wagon' },
  { make_name: 'Nissan', model_name: 'Laurel',  year_start: 1997, year_end: 2002, is_jdm_only: true, body_style: 'sedan' },      // C35
  { make_name: 'Nissan', model_name: 'Gloria',  year_start: 1999, year_end: 2004, is_jdm_only: true, body_style: 'sedan' },      // Y34
  { make_name: 'Nissan', model_name: 'Cedric',  year_start: 1999, year_end: 2004, is_jdm_only: true, body_style: 'sedan' },      // Y34

  // Toyota JDM
  { make_name: 'Toyota', model_name: 'Chaser',  year_start: 1992, year_end: 2001, is_jdm_only: true, body_style: 'sedan' },      // JZX90/JZX100
  { make_name: 'Toyota', model_name: 'Mark II', year_start: 1996, year_end: 2000, is_jdm_only: true, body_style: 'sedan' },      // JZX100
  { make_name: 'Toyota', model_name: 'Cresta',  year_start: 1996, year_end: 2001, is_jdm_only: true, body_style: 'sedan' },      // JZX100
  { make_name: 'Toyota', model_name: 'Soarer',  year_start: 1991, year_end: 2000, is_jdm_only: true, body_style: 'coupe' },      // Z30
  { make_name: 'Toyota', model_name: 'Aristo',  year_start: 1997, year_end: 2005, is_jdm_only: true, body_style: 'sedan' },      // JZS161
  { make_name: 'Toyota', model_name: 'Altezza', year_start: 1998, year_end: 2005, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Verossa', year_start: 2001, year_end: 2004, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Brevis',  year_start: 2001, year_end: 2007, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Toyota', model_name: 'Estima',  year_start: 1990, year_end: 2019, is_jdm_only: true, body_style: 'minivan' },

  // Honda JDM (the JDM Honda Integra; the US Acura Integra comes from NHTSA)
  { make_name: 'Honda', model_name: 'Integra', year_start: 1993, year_end: 2001, is_jdm_only: false, body_style: 'coupe' },      // DC2
  { make_name: 'Honda', model_name: 'Legend',  year_start: 1996, year_end: 2004, is_jdm_only: true,  body_style: 'sedan' },      // KA9
  { make_name: 'Honda', model_name: 'Stream',  year_start: 2000, year_end: 2006, is_jdm_only: true,  body_style: 'wagon' },

  // Mitsubishi JDM (GTO = JDM name of the US-market 3000GT, which NHTSA provides)
  { make_name: 'Mitsubishi', model_name: 'GTO', year_start: 1990, year_end: 2000, is_jdm_only: true, body_style: 'coupe' },

  // Mazda JDM
  { make_name: 'Mazda', model_name: 'Cosmo',          year_start: 1990, year_end: 1996, is_jdm_only: true, body_style: 'coupe' },
  { make_name: 'Mazda', model_name: 'Eunos Roadster', year_start: 1989, year_end: 1997, is_jdm_only: true, body_style: 'convertible' },
  { make_name: 'Mazda', model_name: 'Atenza',         year_start: 2002, year_end: 2019, is_jdm_only: true, body_style: 'sedan' },
  { make_name: 'Mazda', model_name: 'Autozam AZ-1',   year_start: 1992, year_end: 1994, is_jdm_only: true, body_style: 'coupe' },

  // Suzuki JDM
  { make_name: 'Suzuki', model_name: 'Cappuccino', year_start: 1991, year_end: 1998, is_jdm_only: true, body_style: 'convertible' },
  { make_name: 'Suzuki', model_name: 'Alto',       year_start: 1987, year_end: 2000, is_jdm_only: true, body_style: 'hatchback' },  // Alto Works
  { make_name: 'Suzuki', model_name: 'Jimny',      year_start: 1995, year_end: 1998, is_jdm_only: true, body_style: 'suv' },        // JA12

  // (Subaru Impreza WRX STI / Legacy B4 / SVX all come from NHTSA at family level.)
]

// US classic / muscle nameplates that the modern-only NHTSA pull does NOT return
// (e.g. Dodge has no classic Charger/Challenger). Family-level; performance names
// (SS, R/T, Boss, Mach 1, Super Bee, GT500, Trans Am) live on the car as trims.
// Mirrors migrations 056 + 057. source = 'us_manual'.
const US_MUSCLE_MODELS = [
  // Ford
  { make_name: 'Ford', model_name: 'Torino',   year_start: 1968, year_end: 1976 },
  { make_name: 'Ford', model_name: 'Fairlane', year_start: 1955, year_end: 1970 },
  { make_name: 'Ford', model_name: 'Falcon',   year_start: 1960, year_end: 1970 },
  { make_name: 'Ford', model_name: 'Galaxie',  year_start: 1959, year_end: 1974 },
  { make_name: 'Ford', model_name: 'Ranchero', year_start: 1957, year_end: 1979 },
  // Chevrolet
  { make_name: 'Chevrolet', model_name: 'Chevelle', year_start: 1964, year_end: 1977 },
  { make_name: 'Chevrolet', model_name: 'Bel Air',  year_start: 1953, year_end: 1975 },
  { make_name: 'Chevrolet', model_name: 'Biscayne', year_start: 1958, year_end: 1972 },
  { make_name: 'Chevrolet', model_name: 'Nomad',    year_start: 1955, year_end: 1961 },
  { make_name: 'Chevrolet', model_name: 'Chevy II', year_start: 1962, year_end: 1968 },
  // Dodge
  { make_name: 'Dodge', model_name: 'Charger',    year_start: 1966, year_end: 2023 },
  { make_name: 'Dodge', model_name: 'Challenger', year_start: 1970, year_end: 2023 },
  { make_name: 'Dodge', model_name: 'Dart',       year_start: 1960, year_end: 2016 },
  { make_name: 'Dodge', model_name: 'Coronet',    year_start: 1949, year_end: 1976 },
  { make_name: 'Dodge', model_name: 'Polara',     year_start: 1960, year_end: 1973 },
  { make_name: 'Dodge', model_name: 'Viper',      year_start: 1992, year_end: 2017 },
  { make_name: 'Dodge', model_name: 'Magnum',     year_start: 1978, year_end: 2008 },
  { make_name: 'Dodge', model_name: 'Daytona',    year_start: 1984, year_end: 1993 },
  // Plymouth
  { make_name: 'Plymouth', model_name: 'Barracuda',   year_start: 1964, year_end: 1974 },
  { make_name: 'Plymouth', model_name: 'Road Runner', year_start: 1968, year_end: 1980 },
  { make_name: 'Plymouth', model_name: 'GTX',         year_start: 1967, year_end: 1971 },
  { make_name: 'Plymouth', model_name: 'Satellite',   year_start: 1965, year_end: 1974 },
  { make_name: 'Plymouth', model_name: 'Belvedere',   year_start: 1954, year_end: 1970 },
  { make_name: 'Plymouth', model_name: 'Duster',      year_start: 1970, year_end: 1976 },
  { make_name: 'Plymouth', model_name: 'Valiant',     year_start: 1960, year_end: 1976 },
  { make_name: 'Plymouth', model_name: 'Fury',        year_start: 1956, year_end: 1978 },
  // Buick
  { make_name: 'Buick', model_name: 'Gran Sport', year_start: 1965, year_end: 1975 },
  { make_name: 'Buick', model_name: 'Wildcat',    year_start: 1963, year_end: 1970 },
  // Oldsmobile
  { make_name: 'Oldsmobile', model_name: '442',  year_start: 1964, year_end: 1991 },
  { make_name: 'Oldsmobile', model_name: 'F-85', year_start: 1961, year_end: 1972 },
]

// Seed a manual model list (JDM or US muscle). Resolves make_id by name from the
// already-inserted makes, then inserts with ON CONFLICT DO NOTHING (make+model is
// unique), so anything NHTSA already provided at family level is left untouched.
async function seedManualModels(label, models, source) {
  if (models.length === 0) return

  const neededMakeNames = [...new Set(models.map(m => m.make_name))]
  const orFilter = neededMakeNames.map(n => `make_name.ilike.${n}`).join(',')
  const { data: makesData } = await supabase
    .from('vehicle_makes')
    .select('id, make_name')
    .or(orFilter)

  const makeMap = {}
  makesData?.forEach(m => { makeMap[m.make_name.toLowerCase()] = m.id })

  const missingMakes = new Set()
  const rows = models
    .filter(m => {
      const found = makeMap[m.make_name.toLowerCase()]
      if (!found) missingMakes.add(m.make_name)
      return found
    })
    .map(m => ({
      make_id:     makeMap[m.make_name.toLowerCase()],
      model_name:  m.model_name,
      year_start:  m.year_start ?? null,
      year_end:    m.year_end ?? null,
      is_jdm_only: m.is_jdm_only ?? false,
      body_style:  m.body_style ?? null,
      source,
    }))

  const skipped = models.length - rows.length
  if (skipped > 0) {
    console.warn(`  Warning: ${skipped} ${label} models skipped — makes not in DB: ${[...missingMakes].join(', ')}`)
    console.warn(`  Run the full NHTSA import first (without --jdm-only) to populate vehicle_makes.`)
  }

  const result = await batchInsert('vehicle_models', rows, 'ignore')
  console.log(`  ✓ ${result.count} ${label} models inserted`)
}

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

  // Insert supplemental models — JDM (jdm_manual) + US muscle/classic (us_manual).
  console.log(`  Inserting ${JDM_MODELS.length} JDM + ${US_MUSCLE_MODELS.length} US-muscle model records...`)
  await seedManualModels('JDM', JDM_MODELS, 'jdm_manual')
  await seedManualModels('US muscle', US_MUSCLE_MODELS, 'us_manual')
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
