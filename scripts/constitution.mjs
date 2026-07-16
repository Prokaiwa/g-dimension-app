/**
 * G-Dimension constitution check: zero-dependency mechanical enforcement of
 * the architectural boundaries recorded in docs/ENGINEERING_PRINCIPLES.md.
 * Plain assertions, clear output, exit 1 on any failure.
 *
 * Run before every commit as part of `npm run verify`
 * (see docs/IMPLEMENTATION_GUIDE.md → Verification strategy).
 *
 * When a check fails it prints WHY the rule exists. Fix the code to respect
 * the boundary — never widen an allowlist here without recording the decision
 * in docs/DECISION_LOG.md first.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { computeCspReport } from './csp-hashes.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

let failures = 0
let passed = 0

function check(name, condition, why = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${why ? `\n      why: ${why}` : ''}`)
  }
}

function section(name) {
  console.log(`\n${name}`)
}

/** Recursively collect files under dir matching the extension list. */
function collect(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collect(full, exts, out)
    else if (exts.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

const srcFiles = collect(SRC, ['.ts', '.tsx']).filter((f) => !f.includes('.test.'))
const readRel = (f) => relative(ROOT, f)

/** Return the src-relative paths of files whose content matches the regex. */
function filesMatching(regex) {
  const hits = []
  for (const f of srcFiles) {
    if (regex.test(readFileSync(f, 'utf8'))) hits.push(readRel(f))
  }
  return hits.sort()
}

function onlyIn(hits, allowlist, label) {
  const extra = hits.filter((h) => !allowlist.includes(h))
  return { ok: extra.length === 0, extra }
}

// ---------------------------------------------------------------------------
section('Privacy boundary')
{
  // car_private holds VIN, license plate, purchase price. It exists because the
  // cars public-read RLS policy exposes every column of public cars to the anon
  // key (see migration 061 + ADR in docs/DECISION_LOG.md). All access must go
  // through the guarded helpers in src/lib/carPrivate.ts.
  const hits = filesMatching(/from\(\s*['"]car_private['"]\s*\)/)
  const { extra } = onlyIn(hits, ['src/lib/carPrivate.ts'])
  check(
    'car_private queried only via lib/carPrivate.ts',
    extra.length === 0,
    `direct car_private queries found in: ${extra.join(', ')} — use getCarPrivate/upsertCarPrivate so VIN/plate/price can never leak to a public surface`
  )

  const secretHits = filesMatching(/service_role|SUPABASE_SERVICE/i)
  check(
    'no service_role key material in client code',
    secretHits.length === 0,
    `found in: ${secretHits.join(', ')} — the service_role key bypasses RLS and must never ship in the client bundle`
  )
}

// ---------------------------------------------------------------------------
section('Single sources of truth')
{
  // MOD_GROUPS / CATEGORY_TO_GROUP power the Build Sheet, Featured, and the
  // public Build Sheet. A second definition anywhere means the groupings drift.
  const defHits = filesMatching(/const\s+(MOD_GROUPS|CATEGORY_TO_GROUP)\s*[=:]/)
  const { extra } = onlyIn(defHits, ['src/lib/buildGroups.ts'])
  check(
    'MOD_GROUPS / CATEGORY_TO_GROUP defined only in lib/buildGroups.ts',
    extra.length === 0,
    `redefinition found in: ${extra.join(', ')} — import from src/lib/buildGroups.ts instead so category→group mapping can never drift`
  )

  // The active-car localStorage key must never be referenced outside the helper.
  const keyHits = filesMatching(/gdim_chosen_car_id/)
  const keyCheck = onlyIn(keyHits, ['src/lib/activeCar.ts'])
  check(
    "localStorage key 'gdim_chosen_car_id' referenced only in lib/activeCar.ts",
    keyCheck.extra.length === 0,
    `found in: ${keyCheck.extra.join(', ')} — use getActiveCarId/setActiveCar helpers (CLAUDE.md → Active Car Pattern)`
  )
}

// ---------------------------------------------------------------------------
section('Environment and network access')
{
  // Env access is confined to three files so a future runtime change (desktop
  // shell, different bundler) has exactly one seam per concern.
  const envHits = filesMatching(/import\.meta\.env/)
  const envAllow = ['src/App.tsx', 'src/lib/errorTracking.ts', 'src/lib/supabase.ts']
  const envCheck = onlyIn(envHits, envAllow)
  check(
    `import.meta.env only in: ${envAllow.join(', ')}`,
    envCheck.extra.length === 0,
    `found in: ${envCheck.extra.join(', ')} — read config through the existing seams, don't scatter env access`
  )

  // Raw fetch() is allowlisted: everything else talks to Supabase through the
  // client. New fetch sites need a DECISION_LOG entry (what leaves the device?).
  const fetchHits = filesMatching(/[^.\w]fetch\(/)
  const fetchAllow = ['src/lib/avatar.ts', 'src/lib/buildPdf.ts', 'src/lib/sound.ts']
  const fetchCheck = onlyIn(fetchHits, fetchAllow)
  check(
    `raw fetch() only in: ${fetchAllow.join(', ')}`,
    fetchCheck.extra.length === 0,
    `found in: ${fetchCheck.extra.join(', ')} — new network call sites must be deliberate; record the decision before widening this list`
  )
}

// ---------------------------------------------------------------------------
section('Migration discipline')
{
  const sqlFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))
  const NON_NUMBERED_ALLOW = ['buckets.sql', 'nightly_purge.sql']

  const nonNumbered = sqlFiles.filter((f) => !/^\d{3}/.test(f))
  const unexpectedNonNumbered = nonNumbered.filter((f) => !NON_NUMBERED_ALLOW.includes(f))
  check(
    'non-numbered .sql files limited to known utilities',
    unexpectedNonNumbered.length === 0,
    `unexpected: ${unexpectedNonNumbered.join(', ')} — migrations must be numbered; utilities go in the documented allowlist`
  )

  // Numbers covered by each file. Ranged names like 010_014_x.sql cover 010–014.
  const covered = new Map() // number -> [files]
  for (const f of sqlFiles.filter((x) => /^\d{3}/.test(x))) {
    const m = f.match(/^(\d{3})(?:_(\d{3}))?_/)
    if (!m) continue
    const start = Number(m[1])
    const end = m[2] && /^\d{3}$/.test(m[2]) ? Number(m[2]) : start
    for (let n = start; n <= (end >= start ? end : start); n++) {
      if (!covered.has(n)) covered.set(n, [])
      covered.get(n).push(f)
    }
  }

  check(
    'migration 028 does not exist (permanently skipped slot)',
    !covered.has(28),
    'the 027→029 gap is intentional and documented in CLAUDE.md — never fill it'
  )

  // 026 has a documented PRELUDE companion; every other number maps to one file.
  const dupes = [...covered.entries()].filter(([n, files]) => n !== 26 && files.length > 1)
  check(
    'no duplicate migration numbers (026 PRELUDE pair excepted)',
    dupes.length === 0,
    `duplicates: ${dupes.map(([n, files]) => `${n}: ${files.join(' + ')}`).join('; ')}`
  )

  const max = Math.max(...covered.keys())
  const holes = []
  for (let n = 1; n <= max; n++) {
    if (n === 28) continue
    if (!covered.has(n)) holes.push(String(n).padStart(3, '0'))
  }
  check(
    `migration numbers contiguous 001–${String(max).padStart(3, '0')} (028 excepted)`,
    holes.length === 0,
    `missing numbers: ${holes.join(', ')} — numbering gaps make the applied-migration watermark ambiguous`
  )
}

// ---------------------------------------------------------------------------
section('CSP inline-script hashes')
{
  // Every executable inline <script> in index.html / public/marketing.html is
  // allowlisted in vercel.json's script-src BY SHA-256 HASH. A mismatch means
  // production silently blocks the script while dev keeps working — this
  // exact failure shipped once before (CLAUDE.md CSP note). Run
  // `node scripts/csp-hashes.mjs` to print the hash to paste into vercel.json.
  const { missing, orphans } = computeCspReport()
  check(
    'every inline script hash present in vercel.json script-src',
    missing.length === 0,
    `missing: ${missing.map((s) => `${s.file} script #${s.index} → '${s.hash}'`).join('; ')}`
  )
  check(
    'no orphan sha256 hashes in vercel.json script-src',
    orphans.length === 0,
    `stale entries (no matching inline script): ${orphans.join(', ')} — remove them or restore the script they hashed`
  )
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
console.log('Constitution OK.')
