// End-to-end exercise of the fill-up sheet against a live Supabase, driven
// through the real UI.
//
//   npm run dev -- --port 5199 &
//   GDIM_EMAIL=... GDIM_PASSWORD=... node design/fuel-mockup/test-sheet.mjs
//
// SELF-CLEANING BY CONSTRUCTION. Every row it writes is deleted in the `finally`
// block, and the odometer it saves is deliberately BELOW the car's stored
// reading so the forward-only clamp in the sheet is a guaranteed no-op and
// `cars` is never written at all. The check at the end proves both.
//
// What it actually verifies, in order:
//   1. the grip renders at the foot of Home and is a real 44px-class target
//   2. tapping it opens the sheet
//   3. THE CONTAINING-BLOCK TRAP: the sheet's panel must end exactly at the
//      viewport bottom. Home's stage carries `perspective` and its world carries
//      `transform`, either of which would silently anchor a position:fixed child
//      to itself. This assertion is the one that catches it; a screenshot does
//      not, because the sheet still renders, just below the fold.
//   4. the odometer prefills from cars.current_mileage
//   5. the derived price line and the live economy figure
//   6. the adversarial inputs: commas, a volume that rounds to zero, an
//      impossible odometer, junk text
//   7. a real INSERT through the UI (grants + RLS + column types + constraints)
//   8. the entry appearing on /fuel
//   9. deletion, and proof that cars.current_mileage never moved

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('design/fuel-mockup')
const BASE = process.env.GDIM_BASE || 'http://localhost:5199'

const env = Object.fromEntries(
  fs.readFileSync(path.resolve('.env.local'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }))
const SB = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── REST helpers (used only for setup, verification and cleanup) ─────────────
const auth = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.GDIM_EMAIL, password: process.env.GDIM_PASSWORD }),
})).json()
if (!auth.access_token) { console.error('sign-in failed:', auth); process.exit(1) }
const TOK = auth.access_token
const rest = async (p, init = {}) => {
  const res = await fetch(`${SB}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${TOK}`, 'content-type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const me = auth.user.id
// Kept as two selects: before migration 098, `volume_unit` has no column grant
// and one ungranted column 42501s the whole row.
const active = (await rest(`users?id=eq.${me}&select=active_car_id`)).body?.[0]
const volPref = await rest(`users?id=eq.${me}&select=volume_unit`)
const CAR = process.env.GDIM_CAR || active?.active_car_id
  || (await rest('cars?deleted_at=is.null&select=id&limit=1')).body?.[0]?.id
if (!CAR) { console.error('no active car on this account'); process.exit(1) }
const carRow = (await rest(`cars?id=eq.${CAR}&select=id,year,model,current_mileage,mileage_unit`)).body?.[0]
console.log(`car ${carRow.year} ${carRow.model} · odo ${carRow.current_mileage} ${carRow.mileage_unit ?? 'mi'}`)
ok('users.volume_unit is readable (migration 098)', volPref.status === 200,
  volPref.status === 200 ? String(volPref.body?.[0]?.volume_unit) : JSON.stringify(volPref.body))

const before = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []
console.log(`existing fuel rows: ${before.length}`)
const beforeIds = new Set(before.map(r => r.id))
const beforeMileage = carRow.current_mileage

// The reading we save: strictly below the stored odometer, so the sheet's
// forward-only clamp cannot fire.
const SAFE_ODO = Math.max(1, (beforeMileage ?? 1000) - 500)
const COMMA_ODO = Math.max(1, SAFE_ODO - 1500)

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
})
// Chromium cannot egress through the sandbox proxy; relay every external
// request through Node's fetch, which can.
for (const pattern of ['**://*.supabase.co/**', '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**']) {
  await ctx.route(pattern, async (route) => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), {
        method: req.method(), headers: req.headers(),
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
        redirect: 'follow',
      })
      const body = Buffer.from(await res.arrayBuffer()); const headers = {}
      res.headers.forEach((v, k) => { if (k === 'content-encoding' || k === 'content-length') return; headers[k] = v })
      await route.fulfill({ status: res.status, headers, body })
    } catch { await route.abort() }
  })
}
await ctx.addInitScript((carId) => {
  sessionStorage.setItem('gdim_splash_seen', '1')
  if (carId) localStorage.setItem('gdim_chosen_car_id', carId)
}, CAR)

const page = await ctx.newPage()
const consoleErrors = []
const failedUrls = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`))
// A console message for a failed request carries a status and no URL. Judging
// "is this error expected?" needs the URL, so record responses separately.
page.on('response', r => { if (r.status() >= 400) failedUrls.push(`${r.status()} ${r.url().replace(SB, '')}`) })

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
  await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(u => !/\/login$/.test(u.pathname), { timeout: 25_000 })

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(3200)   // entry animation + the idle fuel bootstrap

  // 1 ── the grip
  const grip = page.locator('button[aria-label="Log a fill-up"]')
  ok('grip renders', await grip.count() === 1)
  const gb = await grip.boundingBox()
  ok('grip is a real target', gb && gb.height >= 36 && gb.width >= 88, gb && `${Math.round(gb.width)}x${Math.round(gb.height)}`)
  ok('grip sits below the wordmark', gb && gb.y > 800, gb && `y=${Math.round(gb.y)}`)
  await page.screenshot({ path: path.join(OUT, 'test-home-grip.png') })

  // 2 ── open
  await grip.click()
  await page.waitForTimeout(600)
  ok('sheet opens', await page.getByRole('button', { name: 'Save fill-up' }).count() === 1)

  // 3 ── the containing-block assertion
  const geom = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => {
      const s = getComputedStyle(e)
      return s.position === 'fixed' && s.zIndex === '31'
    })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { bottom: Math.round(r.bottom), top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), vh: window.innerHeight }
  })
  ok('sheet is anchored to the VIEWPORT, not to the map stage',
    geom && Math.abs(geom.bottom - geom.vh) <= 1,
    geom ? `panel bottom ${geom.bottom} vs viewport ${geom.vh}` : 'panel not found')
  ok('sheet spans the screen', geom && geom.left === 0 && geom.width >= 430, geom && `left ${geom.left} w ${geom.width}`)

  // 4 ── prefill
  const odo = page.getByLabel('Odometer')
  const prefill = await odo.inputValue()
  ok('odometer prefills from the car', Number(prefill) === beforeMileage, `"${prefill}" vs ${beforeMileage}`)
  await page.screenshot({ path: path.join(OUT, 'test-sheet-open.png') })

  const vol = page.getByLabel('Volume')
  const tot = page.getByLabel('Total cost')
  const derived = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => /per (gallon|litre)|mpg this tank/.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : ''
  })

  // 5 ── derived arithmetic
  await vol.fill('14.2')
  await tot.fill('59.47')
  await page.waitForTimeout(250)
  const d1 = await derived()
  ok('price per unit is derived', d1.includes('$4.19'), `"${d1}"`)

  // 6 ── adversarial input. The comma case has to actually SAVE to prove the
  // reading survived parsing, so it uses a value below the stored odometer and
  // the clamp stays a no-op.
  await odo.fill(COMMA_ODO.toLocaleString('en-US'))
  await vol.fill('10')
  await tot.fill('40')
  await page.getByRole('button', { name: 'Save fill-up' }).click()
  await page.waitForTimeout(400)
  ok('comma reading does not read as an empty field',
    !(await page.evaluate(() => document.body.innerText.includes('Enter the odometer reading'))))
  await page.waitForTimeout(1200)
  ok('sheet closes on a successful save', await page.getByRole('button', { name: 'Save fill-up' }).count() === 0)
  const commaRow = ((await rest(`fuel_entries?car_id=eq.${CAR}&odometer=eq.${COMMA_ODO}&select=odometer`)).body ?? [])[0]
  ok('the comma reading stored the number that was typed', commaRow?.odometer === COMMA_ODO, JSON.stringify(commaRow))

  // reopen: there is now history, so the chain-breaking toggle should exist
  await grip.click()
  await page.waitForTimeout(700)
  ok('the missed-fill toggle appears once there is a chain to break',
    await page.getByRole('switch', { name: /Missed a fill-up/ }).count() === 1)

  // the live estimate: 250 miles on 10 gallons is 25.0 mpg, computed by the
  // same chain /fuel will use after the save
  await page.getByLabel('Odometer').fill(String(COMMA_ODO + 250))
  await page.getByLabel('Volume').fill('10')
  await page.waitForTimeout(300)
  const dLive = await derived()
  ok('the tank economy is estimated live', dLive.includes('25.0 mpg this tank'), `"${dLive}"`)

  await page.getByLabel('Odometer').fill('99999999')
  await page.getByRole('button', { name: 'Save fill-up' }).click()
  await page.waitForTimeout(300)
  ok('an impossible odometer is refused client-side',
    await page.evaluate(() => document.body.innerText.includes('too high to be real')))

  await page.getByLabel('Odometer').fill(String(SAFE_ODO))
  await page.getByLabel('Volume').fill('0.0001')
  await page.getByRole('button', { name: 'Save fill-up' }).click()
  await page.waitForTimeout(300)
  ok('a volume that rounds to zero is refused before it reaches the check constraint',
    await page.evaluate(() => document.body.innerText.includes('more than zero')))

  await page.getByLabel('Odometer').fill('not a number')
  await page.getByRole('button', { name: 'Save fill-up' }).click()
  await page.waitForTimeout(300)
  ok('junk text is refused',
    await page.evaluate(() => document.body.innerText.includes('Enter the odometer reading')))

  // 7 ── the real save
  await page.getByLabel('Odometer').fill(String(SAFE_ODO))
  await page.waitForTimeout(250)
  ok('the refusal clears as soon as the field is corrected',
    !(await page.evaluate(() => document.body.innerText.includes('Enter the odometer reading'))))
  await page.getByLabel('Volume').fill('12.5')
  await page.getByLabel('Total cost').fill('50.00')
  await page.waitForTimeout(250)
  const d2 = await derived()
  ok('price recomputes', d2.includes('$4.00'), `"${d2}"`)
  await page.screenshot({ path: path.join(OUT, 'test-sheet-filled.png') })
  await page.getByRole('button', { name: 'Save fill-up' }).click()
  await page.waitForTimeout(1600)
  ok('sheet closes after saving', await page.getByRole('button', { name: 'Save fill-up' }).count() === 0)

  const after = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id,odometer,volume,total_cost,is_full,is_missed,filled_on&order=created_at.desc`)).body ?? []
  const mine = after.filter(r => !beforeIds.has(r.id))
  ok('the insert reached the database', mine.length > 0, `${mine.length} new row(s)`)
  const row = mine.find(r => r.odometer === SAFE_ODO)
  ok('the row carries what was typed', row && Number(row.volume) === 12.5 && Number(row.total_cost) === 50,
    row ? `odo ${row.odometer} vol ${row.volume} total ${row.total_cost} full ${row.is_full}` : 'not found')

  // 8 ── it shows up on /fuel
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const onPage = await page.evaluate(() => document.body.innerText)
  ok('/fuel lists the new fill-up', onPage.includes('12.5 gal') || onPage.includes('$50.00'))
  await page.screenshot({ path: path.join(OUT, 'test-fuel-after.png'), fullPage: true })

  // 9 ── the grip cools
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)
  const gripColor = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Log a fill-up"]')
    return b ? getComputedStyle(b.firstElementChild).backgroundColor : ''
  })
  ok('grip is at rest after a fresh fill', !gripColor.includes('200, 102, 26'), gripColor)

  // Two exclusions, both named rather than pattern-matched away. The sandbox has
  // no direct egress, so Sentry's transport fails with ERR_TUNNEL_CONNECTION_FAILED
  // — harness, not app. And supabase-js races its own Navigator Locks lock on a
  // navigation during a token refresh; ErrorBanner's BENIGN already refuses to
  // show that one, so this must not fail on it either.
  const BENIGN = /ERR_TUNNEL_CONNECTION_FAILED|sentry|lock:sb-.*-auth-token|lock .* was released/i
  const appErrors = consoleErrors.filter(e => !BENIGN.test(e) && !/Failed to load resource/.test(e))
  ok('no console errors', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))
  // The volume_unit 403 has its own assertion at the top; anything else that
  // failed over the wire is news.
  const unexpected = failedUrls.filter(u => !u.includes('volume_unit'))
  ok('no unexpected failed requests', unexpected.length === 0, unexpected.slice(0, 4).join(' | '))
} finally {
  await browser.close()
  // ── cleanup ──
  const now = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []
  const created = now.filter(r => !beforeIds.has(r.id))
  for (const r of created) await rest(`fuel_entries?id=eq.${r.id}`, { method: 'DELETE' })
  const left = ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).filter(r => !beforeIds.has(r.id))
  ok('every row this run created was deleted', left.length === 0, `${created.length} removed, ${left.length} left`)
  const carAfter = (await rest(`cars?id=eq.${CAR}&select=current_mileage`)).body?.[0]
  ok('cars.current_mileage was never touched', carAfter?.current_mileage === beforeMileage,
    `${beforeMileage} -> ${carAfter?.current_mileage}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
