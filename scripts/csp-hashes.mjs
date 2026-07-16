/**
 * CSP inline-script hash check.
 *
 * vercel.json's Content-Security-Policy allowlists the executable inline
 * <script> blocks in index.html and public/marketing.html BY SHA-256 HASH.
 * Editing any of those scripts without recomputing its hash silently kills the
 * script in production while dev (no CSP) keeps working — this has caused a
 * real incident (ADR-013 / CLAUDE.md CSP note).
 *
 * This module extracts every executable inline script (no src attribute, and
 * not a data block like application/ld+json), hashes the exact text between
 * the tags, and compares the set against the sha256-… tokens in vercel.json's
 * script-src. Both directions must match: a script without a hash breaks prod,
 * and an orphan hash means a stale allowlist entry that should be removed.
 *
 * Run directly (`node scripts/csp-hashes.mjs`) to print the expected hash for
 * every inline script — copy from here when updating vercel.json.
 * Imported by scripts/constitution.mjs as part of `npm run verify`.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

const HTML_FILES = ['index.html', 'public/marketing.html']

/** Executable inline scripts: no src=, and no type= other than a JS MIME. */
function inlineScripts(html) {
  const out = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1]
    if (/\bsrc\s*=/i.test(attrs)) continue
    const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (type && type !== 'text/javascript' && type !== 'module') continue // data block (e.g. ld+json)
    out.push(m[2])
  }
  return out
}

const sha256b64 = (text) => createHash('sha256').update(text, 'utf8').digest('base64')

/**
 * @returns {{ scripts: {file: string, index: number, hash: string, preview: string}[],
 *             cspHashes: string[], missing: typeof scripts, orphans: string[] }}
 */
export function computeCspReport() {
  const scripts = []
  for (const file of HTML_FILES) {
    const html = readFileSync(join(ROOT, file), 'utf8')
    inlineScripts(html).forEach((body, i) => {
      scripts.push({
        file,
        index: i + 1,
        hash: `sha256-${sha256b64(body)}`,
        preview: body.trim().slice(0, 60).replace(/\s+/g, ' '),
      })
    })
  }

  const vercel = readFileSync(join(ROOT, 'vercel.json'), 'utf8')
  const scriptSrc = vercel.match(/script-src ([^;]*)/)?.[1] ?? ''
  const cspHashes = [...scriptSrc.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((x) => x[1])

  const missing = scripts.filter((s) => !cspHashes.includes(s.hash))
  const hashesInUse = new Set(scripts.map((s) => s.hash))
  const orphans = cspHashes.filter((h) => !hashesInUse.has(h))

  return { scripts, cspHashes, missing, orphans }
}

// Run directly: print the full expected-hash table.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { scripts, missing, orphans } = computeCspReport()
  for (const s of scripts) {
    const ok = missing.includes(s) ? '✗ MISSING FROM vercel.json' : '✓ in vercel.json'
    console.log(`${s.file} script #${s.index}: '${s.hash}'  ${ok}\n    ${s.preview}…`)
  }
  if (orphans.length) console.log(`\nOrphan hashes in vercel.json (no matching script): ${orphans.join(', ')}`)
  process.exit(missing.length || orphans.length ? 1 : 0)
}
