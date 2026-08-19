// Checks every UUID route two ways:
//   junk id  -> the designed 404 ("Wrong turn."), and ZERO failing requests
//   valid id -> passes THROUGH the guard to the page (a random uuid resolves to
//               nothing, so the page shows its own empty state -- what matters
//               is that it is not the 404, i.e. the guard let it by)
//
// The second half is the regression that matters: it is easy to ship a guard
// that rejects everything.

import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const JUNK = 'detailing'
const VALID = crypto.randomUUID()   // well-formed, certain not to exist

const ROUTES = [
  '/garage/cars/{id}/edit',
  '/tuning/parts-bin/{id}',
  '/tuning/parts-bin/{id}/edit',
  '/tuning/mod-group/{id}',
  '/tuning/mods/{id}',
  '/tuning/mods/{id}/edit',
  '/tuning/mods/{id}/diy',
  '/tuning/mods/{id}/diy/edit',
  '/maintenance/service/edit/{id}',
  '/maintenance/detail/edit/{id}',
  '/maintenance/{id}',
  '/timeline/entry/{id}/edit',
  '/timeline/entry/{id}',
  '/builds/scantee/mods/{id}',
  '/builds/scantee/mods/{id}/diy',
  '/builds/scantee/timeline/entry/{id}',
  '/builds/scantee/sold/{id}',
]

// Preflight. Both requirements are easy to forget and produce unhelpful crashes
// otherwise (a null fill() on the login form, or a connection refused).
if (!process.env.GD_EMAIL || !process.env.GD_PASSWORD) {
  console.error(
    'Missing credentials.\n\n' +
    '  GD_EMAIL=you@example.com GD_PASSWORD=... npm run check:uuid-routes\n\n' +
    'Any account with at least one car works; it only navigates and measures.'
  )
  process.exit(1)
}
try {
  const r = await fetch(BASE, { signal: AbortSignal.timeout(4000) })
  if (!r.ok) throw new Error(String(r.status))
} catch {
  console.error(`No dev server at ${BASE}. Start one first:\n\n  npm run dev\n`)
  process.exit(1)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()

let bad4xx = []
page.on('response', r => {
  if (r.status() >= 400 && r.url().includes('/rest/v1/')) bad4xx.push(`${r.status()} ${r.url().split('/rest/v1/')[1].slice(0, 60)}`)
})

await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(process.env.GD_EMAIL)
await page.locator('input[type="password"]').fill(process.env.GD_PASSWORD)
await page.getByRole('button', { name: 'Sign In' }).click()
await page.waitForURL('**/home', { timeout: 20000 })
await page.evaluate(() => { try { sessionStorage.setItem('gdim_splash_seen', '1') } catch {} })
await page.waitForTimeout(800)

const is404 = async () => (await page.getByText('Wrong turn.').count()) > 0

let pass = 0, fail = 0
for (const tpl of ROUTES) {
  // --- junk ---
  // Park on a blank page first: a response from the PREVIOUS route can land
  // after the next goto starts and be miscounted against it.
  await page.goto('about:blank')
  await page.waitForTimeout(250)
  bad4xx = []
  await page.goto(BASE + tpl.replace('{id}', JUNK), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const junk404 = await is404()
  const junkReqs = bad4xx.length

  // --- well-formed but nonexistent ---
  bad4xx = []
  await page.goto(BASE + tpl.replace('{id}', VALID), { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const valid404 = await is404()

  const ok = junk404 && junkReqs === 0 && !valid404
  ok ? pass++ : fail++
  console.log(
    `${ok ? '✓' : '✗'} ${tpl.padEnd(40)} junk→${junk404 ? '404' : 'PAGE'} reqs:${junkReqs}  valid→${valid404 ? '404 (WRONGLY BLOCKED)' : 'page'}`
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
