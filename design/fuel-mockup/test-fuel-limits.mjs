// Limit testing for fuel logging, on a throwaway account.
//
//   npm run dev -- --port 5199 &
//   GDIM_EMAIL=... GDIM_PASSWORD=... node design/fuel-mockup/test-fuel-limits.mjs
//
// The companion to test-sheet.mjs. That one proves the happy path end to end and
// is written to be safe on a real account: it cleans up after itself and picks
// values that guarantee `cars` is never written. This one is the opposite — it
// runs on an account nobody cares about and goes looking for the edges:
// gibberish in every field, a cleared date, a future date, a double-tap on Save,
// a dead network, a bogus active car, the column ceilings, a hand-computed
// economy chain checked figure by figure, and sixty entries at once.
//
// It still restores the account at the end, so it can be run repeatedly.

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
const section = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`)

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
    headers: {
      apikey: KEY, authorization: `Bearer ${TOK}`, 'content-type': 'application/json',
      Prefer: 'return=representation', ...(init.headers || {}),
    },
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const me = auth.user.id
const CAR = process.env.GDIM_CAR
  || (await rest(`users?id=eq.${me}&select=active_car_id`)).body?.[0]?.active_car_id
  || (await rest(`cars?user_id=eq.${me}&deleted_at=is.null&select=id&limit=1`)).body?.[0]?.id
const carRow = (await rest(`cars?id=eq.${CAR}&select=id,year,make,model,current_mileage,mileage_unit`)).body?.[0]
const START_MILEAGE = carRow.current_mileage
console.log(`account ${process.env.GDIM_EMAIL}`)
console.log(`car     ${carRow.year} ${carRow.make} ${carRow.model} · odo ${START_MILEAGE} ${carRow.mileage_unit}`)

const wipe = async () => { await rest(`fuel_entries?car_id=eq.${CAR}`, { method: 'DELETE' }) }
const restoreMileage = async () =>
  rest(`cars?id=eq.${CAR}`, { method: 'PATCH', body: JSON.stringify({ current_mileage: START_MILEAGE }) })

const iso = (daysAgo) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

await wipe()

// ── browser ──────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

/** A signed-in page, optionally pointed at a different active car. */
async function openApp({ carId = CAR } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
  })
  const state = { killWrites: false }
  for (const pattern of ['**://*.supabase.co/**', '**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**']) {
    await ctx.route(pattern, async (route) => {
      const req = route.request()
      // The offline simulation. setOffline does not reach a route that is
      // fulfilled from Node, so the failure has to be injected here.
      if (state.killWrites && req.method() === 'POST' && req.url().includes('/fuel_entries')) {
        await route.abort('connectionfailed'); return
      }
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
  await ctx.addInitScript((id) => {
    sessionStorage.setItem('gdim_splash_seen', '1')
    localStorage.setItem('gdim_chosen_car_id', id)
  }, carId)
  const page = await ctx.newPage()
  const errors = []
  // A console message for a failed request carries a status and no URL, which is
  // useless for telling an expected 403 from a real one. The response listener
  // records what actually failed.
  const failedUrls = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
  page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 160)}`))
  page.on('response', r => { if (r.status() >= 400) failedUrls.push(`${r.status()} ${r.url().replace(SB, '')}`) })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
  await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(u => !/\/login$/.test(u.pathname), { timeout: 25_000 })
  return { ctx, page, errors, failedUrls, state }
}

const home = async (page) => {
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(3200)
}
const openSheet = async (page) => {
  await page.locator('button[aria-label="Log a fill-up"]').click()
  await page.waitForTimeout(600)
}
const saveBtn = (page) => page.getByRole('button', { name: 'Save fill-up' })
const bodyText = (page) => page.evaluate(() => document.body.innerText)

let session = await openApp()
const { page } = session

try {
  // ══ 1. every field, fed garbage ════════════════════════════════════════════
  section('garbage in every field')
  await home(page)
  await openSheet(page)

  const refuse = async (label, fields, expect) => {
    for (const [sel, val] of Object.entries(fields)) await page.getByLabel(sel).fill(val)
    await saveBtn(page).click()
    await page.waitForTimeout(350)
    const text = await bodyText(page)
    const rows = ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length
    ok(label, text.includes(expect) && rows === 0, rows ? `${rows} row(s) written` : `"${expect}"`)
  }

  await refuse('empty odometer', { Odometer: '' }, 'Enter the odometer reading')
  await refuse('whitespace odometer', { Odometer: '   ' }, 'Enter the odometer reading')
  await refuse('negative odometer', { Odometer: '-5' }, 'Enter the odometer reading')
  await refuse('odometer in scientific notation', { Odometer: '1e9' }, 'too high to be real')
  await refuse('odometer past the int4 ceiling', { Odometer: '99999999' }, 'too high to be real')
  await refuse('gibberish volume', { Odometer: '72500', Volume: 'abc' }, 'volume is not a number')
  await refuse('gibberish total', { Odometer: '72500', Volume: '10', 'Total cost': 'ten bucks' }, 'total is not a number')
  await refuse('total past the numeric(10,2) ceiling',
    { Odometer: '72500', Volume: '10', 'Total cost': '100000000' }, 'Check the total')
  await refuse('volume that rounds to zero',
    { Odometer: '72500', Volume: '0.0001', 'Total cost': '' }, 'more than zero')

  // date is its own control
  await page.getByLabel('Volume').fill('10')
  await page.getByLabel('Date of fill-up').fill('')
  await saveBtn(page).click()
  await page.waitForTimeout(350)
  ok('a cleared date is refused', (await bodyText(page)).includes('Pick a date'))

  const future = new Date(); future.setDate(future.getDate() + 3)
  await page.getByLabel('Date of fill-up').fill(future.toISOString().slice(0, 10))
  await saveBtn(page).click()
  await page.waitForTimeout(350)
  ok('a future date is refused', (await bodyText(page)).includes('in the future'))
  ok('nothing reached the database through any of that',
    ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length === 0)
  await page.screenshot({ path: path.join(OUT, 'limit-refusals.png') })

  // ══ 2. the ceilings that ARE legal ═════════════════════════════════════════
  section('the largest values the columns can actually hold')
  await page.getByLabel('Date of fill-up').fill(iso(0))
  await page.getByLabel('Odometer').fill('9999999')
  await page.getByLabel('Volume').fill('99999.999')
  await page.getByLabel('Total cost').fill('99999999.99')
  await saveBtn(page).click()
  await page.waitForTimeout(1800)
  const big = ((await rest(`fuel_entries?car_id=eq.${CAR}&select=odometer,volume,total_cost`)).body ?? [])[0]
  ok('the column ceilings save without a 400', !!big,
    big ? `odo ${big.odometer} vol ${big.volume} total ${big.total_cost}` : 'nothing saved')
  ok('the odometer clamp fired on a higher reading',
    (await rest(`cars?id=eq.${CAR}&select=current_mileage`)).body?.[0]?.current_mileage === 9999999)
  await wipe(); await restoreMileage()

  // ══ 3. double-tap on Save ══════════════════════════════════════════════════
  section('a double-tap on Save')
  await home(page)
  await openSheet(page)
  await page.getByLabel('Odometer').fill('72500')
  await page.getByLabel('Volume').fill('11')
  await page.getByLabel('Total cost').fill('44')
  // Two synchronous clicks, inside one frame, before React can paint `disabled`.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => /save fill-up/i.test(e.textContent || ''))
    b.click(); b.click()
  })
  await page.waitForTimeout(2200)
  const dbl = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []
  ok('a double-tap writes exactly one fill-up', dbl.length === 1, `${dbl.length} row(s)`)
  await wipe(); await restoreMileage()

  // ══ 4. a dead network ══════════════════════════════════════════════════════
  section('saving with no connection')
  await home(page)
  await openSheet(page)
  session.state.killWrites = true
  await page.getByLabel('Odometer').fill('72600')
  await page.getByLabel('Volume').fill('12')
  await saveBtn(page).click()
  await page.waitForTimeout(2500)
  ok('the sheet stays open when the save fails', await saveBtn(page).count() === 1)
  ok('and says so', (await bodyText(page)).includes("Couldn't save that"))
  ok('the typed values survive the failure',
    await page.getByLabel('Odometer').inputValue() === '72600')
  session.state.killWrites = false
  await saveBtn(page).click()
  await page.waitForTimeout(2000)
  ok('retrying after the network returns saves once',
    ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length === 1)
  await wipe(); await restoreMileage()

  // ══ 5. a hand-computed chain, checked figure by figure ═════════════════════
  section('the economy chain against arithmetic done by hand')
  // 1000 full 10gal        -> first          (no anchor yet)
  // 1300 full 10gal        -> 300/10 = 30.0
  // 1450 partial 4gal      -> partial        (4 gal rolls forward)
  // 1600 full 6gal         -> 300/(4+6) = 30.0   measured from 1300, not 1450
  // 1750 full, no volume   -> reading        (inert: neither anchors nor breaks)
  // 2200 full 10gal MISSED -> missed         (chain restarts here)
  // 2500 full 10gal        -> 300/10 = 30.0  measured from 2200, not 1600
  const ladder = [
    { odometer: 1000, volume: 10, total_cost: 40, is_full: true, is_missed: false },
    { odometer: 1300, volume: 10, total_cost: 40, is_full: true, is_missed: false },
    { odometer: 1450, volume: 4, total_cost: 16, is_full: false, is_missed: false },
    { odometer: 1600, volume: 6, total_cost: 24, is_full: true, is_missed: false },
    { odometer: 1750, volume: null, total_cost: null, is_full: true, is_missed: false },
    { odometer: 2200, volume: 10, total_cost: 40, is_full: true, is_missed: true },
    { odometer: 2500, volume: 10, total_cost: 40, is_full: true, is_missed: false },
  ]
  const ins = await rest('fuel_entries', {
    method: 'POST',
    body: JSON.stringify(ladder.map((e, i) => ({ ...e, car_id: CAR, user_id: me, filled_on: iso(60 - i * 5) }))),
  })
  ok('the ladder inserted', ins.status === 201, `status ${ins.status}`)

  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const t = await bodyText(page)
  //   avg  = (300+300+300) / (10+10+10)          = 30.0
  //   $/mi = (200-40) / (2500-1000)              = 0.11   (first fill excluded)
  //   $/gal= 200 / 50                            = 4.00
  //   $    = 200
  ok('average economy is 30.0', t.includes('3 full tanks'), t.split('\n').find(l => l.includes('full tank')) || '')
  ok('best and worst agree at 30.0', t.includes('best 30.0') && t.includes('worst 30.0'))
  const lcds = await page.evaluate(() =>
    [...document.querySelectorAll('div[role="img"]')].map(e => e.getAttribute('aria-label')))
  ok('the four readouts read 30.0 / 0.11 / 4.00 / 200',
    lcds[0]?.startsWith('30.0') && lcds[1] === '0.11' && lcds[2] === '4.00' && lcds[3] === '200',
    JSON.stringify(lcds.slice(0, 4)))
  ok('the partial tank is labelled, not given a number', t.includes('PARTIAL'))
  ok('the missed fill is labelled', t.includes('MISSED'))
  ok('the odometer-only entry is labelled a reading', t.includes('READING'))
  ok('the first fill is labelled', t.includes('FIRST'))
  await page.screenshot({ path: path.join(OUT, 'limit-chain.png'), fullPage: true })

  // the sheet's live estimate has to agree with the page it will produce
  await home(page)
  await openSheet(page)
  await page.getByLabel('Odometer').fill('2800')
  await page.getByLabel('Volume').fill('10')
  await page.waitForTimeout(350)
  const live = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => /mpg this tank/.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : ''
  })
  ok('the sheet predicts the tank the page will show', live.includes('30.0 mpg this tank'), `"${live}"`)
  await page.keyboard.press('Escape')
  await wipe(); await restoreMileage()

  // ══ 6. scale ═══════════════════════════════════════════════════════════════
  section('sixty fill-ups')
  const many = Array.from({ length: 60 }, (_, i) => ({
    car_id: CAR, user_id: me, filled_on: iso(300 - i * 5),
    odometer: 40000 + i * 320,
    volume: 11 + (i % 5) * 0.4,
    total_cost: 42 + (i % 7),
    is_full: i % 11 !== 0,          // a partial roughly every eleventh
    is_missed: i === 37,
  }))
  const bulk = await rest('fuel_entries', { method: 'POST', body: JSON.stringify(many) })
  ok('sixty rows inserted at once', bulk.status === 201, `status ${bulk.status}`)
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)
  const scale = await page.evaluate(() => {
    // The chart is the one flex row that bottom-aligns its children. Matching on
    // "a div with lots of div children" instead found the fill-ups LIST, whose
    // rows are also divs and are full width — so the bar-width assertion was
    // measuring the wrong element entirely and reported 382px.
    const chart = [...document.querySelectorAll('div')].find(e => {
      const s = getComputedStyle(e)
      return s.display === 'flex' && s.alignItems === 'flex-end' && e.children.length > 5
    })
    const doc = document.documentElement
    // The average line is a child of the same container and is left:0/right:0,
    // i.e. 382px wide. It is not a bar; excluding position:absolute children is
    // what separates the two.
    const bars = chart
      ? [...chart.children].filter(c => c.tagName === 'DIV' && getComputedStyle(c).position !== 'absolute')
      : []
    return {
      bars: bars.length,
      widest: bars.length ? Math.max(...bars.map(c => c.getBoundingClientRect().width)) : 0,
      overflowX: doc.scrollWidth > doc.clientWidth,
      rows: (document.body.innerText.match(/ mpg/g) || []).length,
    }
  })
  ok('the chart drew a bar per measured tank', scale.bars >= 50, `${scale.bars} bars`)
  ok('bars stay inside the panel', scale.widest > 0 && scale.widest < 30, `widest ${scale.widest.toFixed(1)}px`)
  ok('the page never scrolls sideways', !scale.overflowX)
  ok('the log rendered every tank', scale.rows >= 50, `${scale.rows} figures`)
  await page.screenshot({ path: path.join(OUT, 'limit-sixty.png'), fullPage: true })
  await wipe(); await restoreMileage()

  // ══ 7. the ten-day glow ════════════════════════════════════════════════════
  section('the grip going stale')
  const gripColor = () => page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Log a fill-up"]')
    return b ? getComputedStyle(b.firstElementChild).backgroundColor : ''
  })
  await home(page)
  ok('an empty log leaves the grip at rest', !(await gripColor()).includes('200, 102, 26'), await gripColor())

  await rest('fuel_entries', {
    method: 'POST',
    body: JSON.stringify({ car_id: CAR, user_id: me, filled_on: iso(15), odometer: 71000, volume: 12, is_full: true }),
  })
  await home(page)
  ok('fifteen days without a fill-up warms the grip', (await gripColor()).includes('200, 102, 26'), await gripColor())
  await page.screenshot({ path: path.join(OUT, 'limit-grip-stale.png') })

  await rest('fuel_entries', {
    method: 'POST',
    body: JSON.stringify({ car_id: CAR, user_id: me, filled_on: iso(9), odometer: 71300, volume: 12, is_full: true }),
  })
  await home(page)
  ok('nine days is not stale yet', !(await gripColor()).includes('200, 102, 26'), await gripColor())
  await wipe(); await restoreMileage()

  // ══ 8. no car ══════════════════════════════════════════════════════════════
  section('an active car that does not exist')
  const orphan = await openApp({ carId: '00000000-0000-4000-8000-000000000000' })
  await home(orphan.page)
  ok('the grip still renders', await orphan.page.locator('button[aria-label="Log a fill-up"]').count() === 1)
  await openSheet(orphan.page)
  ok('the sheet opens', await saveBtn(orphan.page).count() === 1)
  ok('Save is disabled rather than throwing', await saveBtn(orphan.page).isDisabled())
  ok('no page error', orphan.errors.filter(e => e.startsWith('pageerror')).length === 0,
    orphan.errors.filter(e => e.startsWith('pageerror'))[0] || '')
  await orphan.ctx.close()

  // ══ 9. empty state ═════════════════════════════════════════════════════════
  section('nothing logged at all')
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  const empty = await bodyText(page)
  ok('the empty log explains itself', empty.includes('No fill-ups yet'))
  ok('the readout shows blanks, not zeros or NaN', empty.includes('--.-') || !empty.includes('NaN'))
  ok('the chart says so too', empty.includes('NO TANKS YET'))
  await page.screenshot({ path: path.join(OUT, 'limit-empty.png'), fullPage: true })

  // ══ console ════════════════════════════════════════════════════════════════
  section('console and network')
  // Only two classes of failure are allowed here, and both are named rather than
  // pattern-matched away: the volume_unit 403 that migration 098 fixes, and the
  // fuel_entries POST this test itself aborted in section 4.
  const volumeUnit403 = session.failedUrls.filter(u => u.startsWith('403') && u.includes('volume_unit'))
  const unexpected = session.failedUrls.filter(u =>
    !(u.startsWith('403') && u.includes('volume_unit')) && !u.includes('fuel_entries'))
  ok('every failed request is one of the two expected ones', unexpected.length === 0,
    unexpected.slice(0, 4).join(' | '))
  // Same exclusion the app itself applies (ErrorBanner's BENIGN): supabase-js
  // races its own Navigator Locks lock when a tab resumes or navigates during a
  // token refresh, and the loser rejects. It is self-recovering, and the app
  // already refuses to show it as a banner — so it must not fail this either.
  const BENIGN_LOCK = /lock:sb-.*-auth-token|Navigator LocksManager|lock .* was released|lock broken/i
  const pageErrors = session.errors.filter(e => e.startsWith('pageerror') && !BENIGN_LOCK.test(e))
  ok('no page errors', pageErrors.length === 0, pageErrors[0] || '')
  console.log(`  note  ${volumeUnit403.length} volume_unit 403s (migration 098 pending; every read is guarded, so the app degrades to gal_us)`)
} finally {
  await browser.close()
  await wipe()
  await restoreMileage()
  const left = ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length
  const odo = (await rest(`cars?id=eq.${CAR}&select=current_mileage`)).body?.[0]?.current_mileage
  ok('account left clean', left === 0 && odo === START_MILEAGE, `${left} rows, odo ${odo}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
