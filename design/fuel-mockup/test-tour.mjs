// Walk the onboarding tour end to end, on a throwaway account.
//
//   npm run dev -- --port 5199 &
//   GDIM_EMAIL=... GDIM_PASSWORD=... node design/fuel-mockup/test-tour.mjs
//
// The tour had no coverage at all before this, which is uncomfortable for the
// one flow every new user sees exactly once and can never replay by accident.
//
// DRIVEN BY STATE, NOT BY A SCRIPT. A fixed list of sixteen clicks would break
// on any reordering, and the tour legitimately reorders itself: GarageCarsPage
// calls jump('car-success') when the account already has a car, so the add-car
// steps are skipped here. So each tick reads what is actually on screen and
// picks the one thing that advances it:
//
//   "Got it"  → dismiss, then tap the map node the bubble just named
//   Next/Finish → click
//   neither   → a target step waiting on a real action; click its spotlight
//
// It starts by setting users.tutorial_seen back to false (the tour auto-starts
// once, on /home, when that is false) and ends with the tour writing it true
// again, which is also the last assertion.

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('design/fuel-mockup')
const BASE = process.env.GDIM_BASE || 'http://localhost:5199'
const env = Object.fromEntries(
  fs.readFileSync(path.resolve('.env.local'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
const SB = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? (pass++, console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`)) : (fail++, console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`)) }

const auth = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.GDIM_EMAIL, password: process.env.GDIM_PASSWORD }),
})).json()
if (!auth.access_token) { console.error('sign-in failed:', auth); process.exit(1) }
const TOK = auth.access_token
const me = auth.user.id
// Retried, because the sandbox's egress occasionally answers a request with a
// DNS failure or a 503 and a whole run should not die on a blip that has
// nothing to do with the app.
const rest = async (p, i = {}, attempt = 0) => {
  try {
    const r = await fetch(`${SB}/rest/v1/${p}`, {
      ...i,
      headers: { apikey: KEY, authorization: `Bearer ${TOK}`, 'content-type': 'application/json', Prefer: 'return=minimal', ...(i.headers || {}) },
    })
    const t = await r.text()
    if (r.status >= 500 && attempt < 3) throw new Error(`transient ${r.status}`)
    return { status: r.status, body: t ? JSON.parse(t) : null }
  } catch (e) {
    if (attempt >= 3) throw e
    await new Promise(res => setTimeout(res, 600 * (attempt + 1)))
    return rest(p, i, attempt + 1)
  }
}

const setSeen = (v) => rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ tutorial_seen: v }) })
await setSeen(false)

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
})
for (const p of ['**://*.supabase.co/**', '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**']) {
  await ctx.route(p, async (route) => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), {
        method: req.method(), headers: req.headers(),
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(), redirect: 'follow',
      })
      const body = Buffer.from(await res.arrayBuffer()); const headers = {}
      res.headers.forEach((v, k) => { if (k === 'content-encoding' || k === 'content-length') return; headers[k] = v })
      await route.fulfill({ status: res.status, headers, body })
    } catch { await route.abort() }
  })
}
await ctx.addInitScript(() => sessionStorage.setItem('gdim_splash_seen', '1'))
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e).slice(0, 160)))

/** The bubble's text and counter, or null when the overlay is not painting. */
const bubble = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).zIndex === '100000')
  // NOT offsetParent: it is null for every position:fixed element, so the
  // overlay always looked absent. Measure the box instead.
  if (!el || el.getBoundingClientRect().height === 0) return null
  const txt = el.innerText || ''
  const m = txt.match(/(\d+)\s*\/\s*(\d+)/)
  return { text: txt, index: m ? Number(m[1]) : 0, total: m ? Number(m[2]) : 0 }
})

/** The bubble types its body one character at a time (22ms each), so reading it
 *  on arrival returns a sentence that has not finished being written. Both of
 *  this file's copy assertions failed that way first: "Fuel" and "small bar"
 *  are near the end of their sentences and had not been typed yet. Poll until
 *  the text stops growing. */
const settled = async () => {
  let prev = null
  for (let i = 0; i < 22; i++) {
    const b = await bubble()
    if (!b) return null
    if (prev && b.text.length === prev.text.length) return b
    prev = b
    await page.waitForTimeout(260)
  }
  return prev
}

const NODES = ['Home', 'Tuning', 'Maintenance', 'Featured', 'Timeline']

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
  await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(u => !/\/login$/.test(u.pathname), { timeout: 25_000 })
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)

  const first = await bubble()
  ok('the tour auto-starts when tutorial_seen is false', !!first && first.index === 1, JSON.stringify(first?.index))
  ok('and there are 18 steps now', first?.total === 18, `total ${first?.total}`)

  const seen = new Map()      // index → body text
  let fuelStepIndex = 0
  let ticks = 0

  while (ticks++ < 45) {
    const b = await settled()
    if (!b) { if (process.env.GDIM_TRACE) console.log(`  · overlay gone at tick ${ticks}, url ${page.url()}`); break }
    if (process.env.GDIM_TRACE) console.log(`  · ${b.index}/${b.total} ${page.url().replace(BASE, '')} :: ${b.text.split('\n')[0].slice(0, 70)}`)
    seen.set(b.index, b.text)

    // ── the new step. Detected by its copy rather than its number, so
    // inserting anything before it does not silently move the assertions.
    if (/small bar/.test(b.text) && !fuelStepIndex) {
      fuelStepIndex = b.index
      const grip = page.locator('button[aria-label="Log a fill-up"]')
      const ring = await page.evaluate(() => {
        // The spotlight ring is the accent-bordered box the overlay draws.
        const el = [...document.querySelectorAll('div')]
          .find(e => /2px solid rgb\(200, 102, 26\)/.test(getComputedStyle(e).border))
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) }
      })
      const gb = await grip.boundingBox()
      ok('the grip is spotlighted', !!ring, JSON.stringify(ring))
      ok('and the ring is around the grip, not somewhere else',
        !!ring && !!gb && Math.abs((ring.left + ring.w / 2) - (gb.x + gb.width / 2)) < 4,
        ring && gb ? `ring centre ${ring.left + ring.w / 2}, grip centre ${gb.x + gb.width / 2}` : '')
      ok('the step does NOT demand a fill-up, it offers Next',
        await page.getByRole('button', { name: 'Next' }).count() === 1)
      await page.screenshot({ path: path.join(OUT, 'tour-fuel-step.png') })

      // Pressing it is optional, but it has to work: the sheet must come up
      // and the overlay must get out of its way rather than dim it.
      await grip.click()
      await page.waitForTimeout(800)
      ok('pressing the grip opens the sheet',
        await page.getByRole('button', { name: 'Save fill-up' }).count() === 1)
      ok('and the tour overlay steps aside instead of dimming it', (await bubble()) === null)
      await page.screenshot({ path: path.join(OUT, 'tour-fuel-sheet.png') })

      await page.getByRole('button', { name: 'Cancel' }).click()
      await page.waitForTimeout(700)
      const back = await bubble()
      ok('closing the sheet brings the tour back on the same step',
        !!back && back.index === fuelStepIndex, `${back?.index} vs ${fuelStepIndex}`)
      ok('and nothing was logged, because nothing was asked for',
        ((await rest(`fuel_entries?user_id=eq.${me}&select=id`)).body ?? []).length === 0)
    }

    // ── advance ──
    const gotIt = page.getByRole('button', { name: 'Got it' })
    if (await gotIt.count()) {
      const node = NODES.find(n => new RegExp(`\\b${n}\\b`).test(b.text))
      await gotIt.click()
      await page.waitForTimeout(500)
      if (node) {
        // The node icons animate in on every arrival at /home (destIn, 700ms
        // plus a per-node stagger), and Home's parallax RAF then rewrites the
        // world transform every frame — so the icons are never "stable" and
        // Playwright's actionability check would wait forever for a map that is
        // alive by design. force skips that check; the retry covers a tap that
        // lands mid-entry-animation.
        for (let attempt = 0; attempt < 3; attempt++) {
          await page.waitForTimeout(attempt === 0 ? 900 : 1200)
          await page.locator(`img[alt="${node}"]`).click({ force: true })
          await page.waitForTimeout(1400)
          const after = await bubble()
          if (process.env.GDIM_TRACE) {
            console.log(`    tapped ${node} (try ${attempt + 1}) -> ${page.url().replace(BASE, '')}, step ${after ? after.index : 'hidden'}`)
          }
          if (after && after.index !== b.index) break
        }
      }
      continue
    }
    const nextBtn = page.getByRole('button', { name: /^(Next|Finish)$/ })
    if (await nextBtn.count()) {
      await nextBtn.first().click()
      await page.waitForTimeout(900)
      continue
    }
    // A target step gated on a real action. Click whatever is spotlighted.
    const spot = page.locator('[data-tour]').filter({ has: page.locator(':scope') })
    const tags = await page.evaluate(() =>
      [...document.querySelectorAll('[data-tour]')].map(e => e.getAttribute('data-tour')))
    let clicked = false
    for (const t of ['garage-tile-cars', 'choose-car', 'add-car']) {
      if (tags.includes(t)) {
        await page.locator(`[data-tour="${t}"]`).first().click()
        await page.waitForTimeout(1600)
        clicked = true
        break
      }
    }
    void spot
    if (!clicked) { console.log(`  stuck at ${b.index}/${b.total}: ${b.text.slice(0, 90)}`); break }
  }

  // ── what the walk saw ──
  const maint = [...seen.values()].find(t => /oil change/.test(t))
  ok('the Maintenance slide now mentions Fuel', !!maint && /Fuel/.test(maint),
    maint ? maint.split('\n')[0].slice(0, 120) : 'slide not reached')
  ok('the fuel step sits second to last', fuelStepIndex === 17, `index ${fuelStepIndex}`)
  const closing = seen.get(18)
  ok('the closing slide no longer repeats "that\'s the lap"',
    !!closing && /garage is yours/.test(closing) && !/the lap/.test(closing),
    closing ? closing.split('\n')[0].slice(0, 90) : 'not reached')

  ok('the tour finished and wrote tutorial_seen',
    (await rest(`users?id=eq.${me}&select=tutorial_seen`)).body?.[0]?.tutorial_seen === true)
  ok('no page errors through the whole walk', pageErrors.length === 0, pageErrors[0] || '')
} finally {
  await browser.close()
  await setSeen(true)
  await rest(`fuel_entries?user_id=eq.${me}`, { method: 'DELETE' })
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
