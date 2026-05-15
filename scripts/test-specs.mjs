/**
 * G-Dimension — Spec Insert Test
 *
 * Tests every active part type by inserting a job with dummy spec values,
 * verifying the specs saved, then deleting the test data.
 *
 * Usage:
 *   node scripts/test-specs.mjs your@email.com yourpassword
 *
 * Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// ── Load .env.local ──────────────────────────────────────────────────────────

function loadEnv() {
  try {
    return Object.fromEntries(
      fs.readFileSync('.env.local', 'utf8')
        .split('\n')
        .flatMap(line => {
          const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
          return m ? [[m[1].trim(), m[2].trim()]] : []
        })
    )
  } catch {
    console.error('Could not read .env.local — run from project root')
    process.exit(1)
  }
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// ── Args ─────────────────────────────────────────────────────────────────────

const [,, email, password] = process.argv
if (!email || !password) {
  console.error('Usage: node scripts/test-specs.mjs <email> <password>')
  process.exit(1)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseOptions(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function dummyValue(inputType, options) {
  switch (inputType) {
    case 'text':        return 'test'
    case 'number':      return '42'
    case 'boolean':     return 'true'
    case 'date':        return '2024-01-01'
    case 'select':      return options[0] ?? null
    case 'multiselect': return options.length ? JSON.stringify([options[0]]) : null
    default:            return null
  }
}

const GREEN  = s => `\x1b[32m${s}\x1b[0m`
const RED    = s => `\x1b[31m${s}\x1b[0m`
const DIM    = s => `\x1b[2m${s}\x1b[0m`
const BOLD   = s => `\x1b[1m${s}\x1b[0m`

// ── Main ─────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Sign in
process.stdout.write('Signing in... ')
const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
if (signInErr) {
  console.error(RED('failed — ' + signInErr.message))
  process.exit(1)
}
console.log(GREEN('ok'))

// Get a car to attach test jobs to
const { data: cars } = await supabase.from('cars').select('id, nickname').limit(1)
if (!cars?.length) {
  console.error(RED('No cars found on this account'))
  process.exit(1)
}
const car = cars[0]
console.log(`Using car: ${BOLD(car.nickname)} ${DIM('(' + car.id + ')')}\n`)

// Load all active part types
const { data: partTypes, error: ptErr } = await supabase
  .from('part_types')
  .select('id, name, category')
  .eq('is_active', true)
  .order('category')
  .order('display_order')

if (ptErr || !partTypes?.length) {
  console.error(RED('Failed to load part types: ' + ptErr?.message))
  process.exit(1)
}

// ── Run tests ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures = []
let lastCategory = ''

for (const pt of partTypes) {
  if (pt.category !== lastCategory) {
    console.log(BOLD(`\n${pt.category}`))
    lastCategory = pt.category
  }

  // Load spec templates for this part type
  const { data: templates } = await supabase
    .from('spec_templates')
    .select('spec_key, input_type, options, unit')
    .eq('part_type_id', pt.id)
    .order('display_order')

  // Build spec rows with dummy values
  const specRows = []
  for (const t of templates ?? []) {
    const opts = parseOptions(t.options)
    const val  = dummyValue(t.input_type, opts)
    if (val !== null) {
      specRows.push({ spec_key: t.spec_key, spec_value: val, spec_unit: t.unit ?? null })
    }
  }

  // Insert test job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      car_id:       car.id,
      type:         'modification',
      category:     pt.category,
      title:        `[TEST] ${pt.name}`,
      status:       'installed',
      part_type_id: pt.id,
      installed_by: 'self',
      parts_cost:   '0',
    })
    .select('id')
    .single()

  if (jobErr) {
    failed++
    failures.push({ name: pt.name, stage: 'job insert', error: jobErr.message })
    console.log(`  ${RED('✗')} ${pt.name} ${DIM('— job insert failed: ' + jobErr.message)}`)
    continue
  }

  // Insert specs
  let specErr = null
  if (specRows.length > 0) {
    const res = await supabase
      .from('job_specs')
      .insert(specRows.map(r => ({ job_id: job.id, ...r })))
    specErr = res.error
  }

  if (specErr) {
    failed++
    failures.push({ name: pt.name, stage: 'spec insert', error: specErr.message })
    console.log(`  ${RED('✗')} ${pt.name} ${DIM('— spec insert failed: ' + specErr.message)}`)
    await supabase.from('jobs').delete().eq('id', job.id)
    continue
  }

  // Verify count
  const { data: saved } = await supabase
    .from('job_specs')
    .select('spec_key')
    .eq('job_id', job.id)

  // Cleanup — cascade deletes job_specs too
  await supabase.from('jobs').delete().eq('id', job.id)

  if ((saved?.length ?? 0) === specRows.length) {
    passed++
    const detail = specRows.length > 0 ? DIM(` (${specRows.length} specs)`) : DIM(' (no specs)')
    console.log(`  ${GREEN('✓')} ${pt.name}${detail}`)
  } else {
    failed++
    const msg = `expected ${specRows.length} specs, got ${saved?.length ?? 0}`
    failures.push({ name: pt.name, stage: 'verify', error: msg })
    console.log(`  ${RED('✗')} ${pt.name} ${DIM('— ' + msg)}`)
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`${GREEN(passed + ' passed')}  ${failed > 0 ? RED(failed + ' failed') : DIM('0 failed')}  ${DIM('out of ' + partTypes.length + ' part types')}`)

if (failures.length) {
  console.log(`\n${BOLD('Failures:')}`)
  for (const f of failures) {
    console.log(`  ${RED('✗')} ${f.name} ${DIM('[' + f.stage + ']')}: ${f.error}`)
  }
}

await supabase.auth.signOut()
