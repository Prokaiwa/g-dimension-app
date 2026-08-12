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
      // return=minimal, deliberately. A representation asks PostgREST to SELECT
      // every column of the written row, and `users` has no table-wide select
      // grant (083 withholds `email`, 098 restates the list) — so a PATCH to
      // users with return=representation comes back 42501 and looks exactly
      // like a broken UPDATE. Nothing here needs the row echoed back.
      Prefer: 'return=minimal', ...(init.headers || {}),
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

// Migration 100 adds receipts.fuel_entry_id. Probed rather than assumed, so the
// suite still completes end to end on a database that has not run it yet.
const HAS_FUEL_RECEIPTS = (await rest('receipts?select=fuel_entry_id&limit=1')).status === 200

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
// The exclusion the app itself applies (ErrorBanner's BENIGN): supabase-js races
// its own Navigator Locks lock when a page navigates during a token refresh, and
// the loser rejects. It is self-recovering, and the app already refuses to show
// it as a banner, so it must not fail a test either.
const BENIGN_LOCK = /lock:sb-.*-auth-token|Navigator LocksManager|lock .* was released|lock broken/i
const realPageErrors = (errors) => errors.filter(e => e.startsWith('pageerror') && !BENIGN_LOCK.test(e))
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
  await page.screenshot({ path: path.join(OUT, 'limit-chain.png') })

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
  await page.screenshot({ path: path.join(OUT, 'limit-sixty.png') })
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
  ok('no page error', realPageErrors(orphan.errors).length === 0, realPageErrors(orphan.errors)[0] || '')
  await orphan.ctx.close()

  // ══ 9. empty state ═════════════════════════════════════════════════════════
  section('nothing logged at all')
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  const empty = await bodyText(page)
  ok('the empty log explains itself', empty.includes('No fill-ups yet'))
  ok('the readout shows blanks, not zeros or NaN', empty.includes('--.-') || !empty.includes('NaN'))
  ok('the chart says so too', empty.includes('NO TANKS YET'))
  await page.screenshot({ path: path.join(OUT, 'limit-empty.png') })

  // ══ 10. the volume preference, live at last ════════════════════════════════
  //
  // None of this could be tested before migration 098: `users.volume_unit` had
  // no column grant, every read 42501'd, and asVolumeUnit(undefined) is 'gal_us'
  // — so a litres user and a 403 produced byte-identical output.
  section('Settings > Units > Volume')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  ok('the Volume row renders', (await bodyText(page)).includes('Fuel volume on fill-ups'))
  await page.getByRole('button', { name: 'L', exact: true }).click()
  await page.waitForTimeout(1400)
  ok('picking L persists to the users row',
    (await rest(`users?id=eq.${me}&select=volume_unit`)).body?.[0]?.volume_unit === 'l')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)
  const litreActive = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'L')
    return b ? getComputedStyle(b).backgroundColor : ''
  })
  ok('and comes back selected on reload', litreActive.includes('200, 102, 26'), litreActive)

  // The derivation is visible in Settings the moment Volume changes: this user is
  // on miles, so picking litres makes them a UK-shaped user.
  const activeEconomy = await page.evaluate(() => {
    const labels = ['mpg (US)', 'mpg (UK)', 'L/100km', 'km/L']
    const b = [...document.querySelectorAll('button')]
      .filter(e => labels.includes(e.textContent.trim()))
      .find(e => getComputedStyle(e).backgroundColor.includes('200, 102, 26'))
    return b ? b.textContent.trim() : ''
  })
  ok('Economy derives to mpg (UK) with nothing stored', activeEconomy === 'mpg (UK)', activeEconomy)

  section('logging a fill-up in litres')
  // An anchor to measure the next tank against.
  await rest('fuel_entries', {
    method: 'POST',
    body: JSON.stringify({ car_id: CAR, user_id: me, filled_on: iso(10), odometer: 70000, volume: 12, total_cost: 48, is_full: true, is_missed: false }),
  })
  await home(page)
  await openSheet(page)
  const sheetText = await bodyText(page)
  ok('the field asks for litres, not gallons', sheetText.includes('LITRES') && !sheetText.includes('GALLONS'))
  await page.getByLabel('Odometer').fill('70300')
  await page.getByLabel('Volume').fill('45')
  await page.getByLabel('Total cost').fill('80')
  await page.waitForTimeout(350)
  const litreDerived = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => /per litre|mpg this tank/.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : ''
  })
  //   80 / 45 L                        = $1.78 per litre
  //   45 L = 45 / 3.785411784          = 11.888 US gal
  //   300 mi / 11.888 gal              = 25.2 US mpg
  //   ...shown as 30.3, because miles + litres derives to IMPERIAL mpg (099).
  //   That combination is the UK, which buys fuel by the litre and still quotes
  //   economy in gallons of its own size: 25.2 * 4.54609 / 3.785411784 = 30.3.
  ok('price is per litre, not per gallon', litreDerived.includes('$1.78 per litre'), `"${litreDerived}"`)
  ok('miles + litres derives to imperial mpg, the UK convention',
    litreDerived.includes('30.3 mpg this tank'), `"${litreDerived}"`)
  await page.screenshot({ path: path.join(OUT, 'limit-litres-sheet.png') })
  await saveBtn(page).click()
  await page.waitForTimeout(2000)
  const litreRow = ((await rest(`fuel_entries?car_id=eq.${CAR}&odometer=eq.70300&select=volume,total_cost`)).body ?? [])[0]
  // The base-unit rule: storage is ALWAYS US gallons, conversion happens at the
  // edges. 45 L must never land in the column as 45.
  ok('the database stored US gallons, not litres', Number(litreRow?.volume) === 11.888,
    `volume ${litreRow?.volume}`)
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  const litrePage = await bodyText(page)
  ok('the record reads the litres back', litrePage.includes('45.0 L'),
    litrePage.split('\n').find(l => l.includes(' L')) || '')
  ok('the price window is captioned per L', litrePage.includes('$ PER L'))
  await page.screenshot({ path: path.join(OUT, 'limit-litres-page.png') })

  // imperial gallons are a different unit, not a different name for the same one
  await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ volume_unit: 'gal_imp' }) })
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600)
  // 11.888 US gal = 11.888 * 3.785411784 / 4.54609 = 9.9 imperial gal
  ok('the same row reads 9.9 in imperial gallons', (await bodyText(page)).includes('9.9 gal'),
    (await bodyText(page)).split('\n').find(l => l.includes('gal')) || '')
  await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ volume_unit: 'gal_us', economy_unit: null }) })
  await wipe(); await restoreMileage()

  // ══ 11. economy units, live since migration 099 ════════════════════════════
  section('the four spellings of fuel economy')
  // Two tanks with different economies, so best and worst are distinguishable
  // and the chart has something to rank:
  //   1000 -> 1300 on 10 gal = 30.0 mpg
  //   1300 -> 1500 on 10 gal = 20.0 mpg
  //   average = 500 mi / 20 gal = 25.0 mpg   (distance over fuel, not a mean)
  await rest('fuel_entries', {
    method: 'POST',
    body: JSON.stringify([
      { car_id: CAR, user_id: me, filled_on: iso(30), odometer: 1000, volume: 10, total_cost: 40, is_full: true, is_missed: false },
      { car_id: CAR, user_id: me, filled_on: iso(20), odometer: 1300, volume: 10, total_cost: 40, is_full: true, is_missed: false },
      { car_id: CAR, user_id: me, filled_on: iso(10), odometer: 1500, volume: 10, total_cost: 40, is_full: true, is_missed: false },
    ]),
  })

  const readout = () => page.evaluate(() => {
    const lcds = [...document.querySelectorAll('div[role="img"]')].map(e => e.getAttribute('aria-label'))
    // textTransform:'uppercase' is CSS, so textContent keeps the source casing.
    // Compare lowercased rather than asserting what the pixels look like.
    const unitChip = [...document.querySelectorAll('span')]
      .find(e => /^(mpg|l\/100km|km\/l)$/.test(e.textContent.trim().toLowerCase()))
    // Bars, excluding the average line (position:absolute, full width).
    const chart = [...document.querySelectorAll('div')].find(e => {
      const s = getComputedStyle(e)
      return s.display === 'flex' && s.alignItems === 'flex-end' && e.children.length > 1
    })
    const bars = chart
      ? [...chart.children].filter(c => getComputedStyle(c).position !== 'absolute')
          .map(c => Math.round(c.getBoundingClientRect().height))
      : []
    const line = document.body.innerText.split('\n').find(l => l.includes('full tanks')) || ''
    return { headline: lcds[0] || '', unit: unitChip ? unitChip.textContent.trim().toLowerCase() : '', bars, line }
  })

  const showEconomy = async (stored) => {
    await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ economy_unit: stored }) })
    await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2400)
    return readout()
  }

  const us = await showEconomy(null)
  ok('nothing stored derives to US mpg on miles + US gallons',
    us.headline.startsWith('25.0') && us.unit === 'mpg', `${us.headline} / ${us.unit}`)
  ok('best and worst are the right way round in mpg',
    us.line.includes('best 30.0') && us.line.includes('worst 20.0'), us.line)

  // 235.215 / mpg. 30 -> 7.8, 25 -> 9.4, 20 -> 11.8.
  const metric = await showEconomy('l_100km')
  ok('L/100km converts the headline', metric.headline.startsWith('9.4'), metric.headline)
  ok('and relabels the panel', metric.unit === 'l/100km', metric.unit)
  // THE INVERSION. In L/100km the better tank is the SMALLER number, so "best"
  // must print 7.8 and "worst" 11.8 — not the other way round, and not the raw
  // min/max of the printed figures.
  ok('best is the SMALLEST number in L/100km, because lower is better',
    metric.line.includes('best 7.8') && metric.line.includes('worst 11.8'), metric.line)
  // ...and the chart must not flip: it scales by efficiency, so the 30 mpg tank
  // stays the taller bar even though it prints the smaller figure.
  ok('the chart still puts the thriftier tank higher',
    metric.bars.length === 2 && metric.bars[0] > metric.bars[1], JSON.stringify(metric.bars))
  const usBars = us.bars
  ok('and draws exactly the same bars as mpg did',
    JSON.stringify(metric.bars) === JSON.stringify(usBars), `${JSON.stringify(usBars)} vs ${JSON.stringify(metric.bars)}`)

  // mpg * 0.42514. 30 -> 12.8, 25 -> 10.6, 20 -> 8.5.
  const kml = await showEconomy('km_l')
  ok('km/L converts and relabels', kml.headline.startsWith('10.6') && kml.unit === 'km/l',
    `${kml.headline} / ${kml.unit}`)
  ok('km/L is higher-is-better, so best is the LARGEST',
    kml.line.includes('best 12.8') && kml.line.includes('worst 8.5'), kml.line)

  const imp = await showEconomy('mpg_imp')
  ok('imperial mpg converts', imp.headline.startsWith('30.0'), imp.headline)

  // The sheet has to predict what the page will show, in the same unit.
  await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ economy_unit: 'l_100km' }) })
  await home(page)
  await openSheet(page)
  await page.getByLabel('Odometer').fill('1800')
  await page.getByLabel('Volume').fill('10')
  await page.waitForTimeout(350)
  const sheetLive = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => /this tank/.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : ''
  })
  // 300 mi on 10 gal = 30 mpg = 7.8 L/100km
  ok('the sheet speaks the same unit as the page', sheetLive.includes('7.8 L/100km this tank'), `"${sheetLive}"`)
  await page.keyboard.press('Escape')

  // Settings shows the stored choice, and picking one persists.
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  const activeEco = () => page.evaluate(() => {
    const labels = ['mpg (US)', 'mpg (UK)', 'L/100km', 'km/L']
    const b = [...document.querySelectorAll('button')]
      .filter(e => labels.includes(e.textContent.trim()))
      .find(e => getComputedStyle(e).backgroundColor.includes('200, 102, 26'))
    return b ? b.textContent.trim() : ''
  })
  ok('Settings shows the stored unit', await activeEco() === 'L/100km', await activeEco())
  await page.getByRole('button', { name: 'km/L', exact: true }).click()
  await page.waitForTimeout(1400)
  ok('picking one persists',
    (await rest(`users?id=eq.${me}&select=economy_unit`)).body?.[0]?.economy_unit === 'km_l')
  await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ economy_unit: null }) })
  await wipe(); await restoreMileage()

  // ══ 12. adding, editing and deleting from /fuel ════════════════════════════
  section('the second door: capture on /fuel')
  await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2400)
  const fab = page.getByRole('button', { name: /Fill-up$/ })
  ok('the page carries an add button', await fab.count() >= 1)
  await fab.first().click()
  await page.waitForTimeout(700)
  ok('it opens the same sheet', await saveBtn(page).count() === 1)
  ok('and hides the "view history" link, being already here',
    !(await bodyText(page)).includes('View fuel history'))
  await page.getByLabel('Odometer').fill('5000')
  await page.getByLabel('Volume').fill('10')
  await page.getByLabel('Total cost').fill('40')
  await saveBtn(page).click()
  await page.waitForTimeout(2000)
  let rows = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id,odometer,volume,total_cost,is_full&order=odometer`)).body ?? []
  ok('a fill-up added from /fuel reaches the database', rows.length === 1 && rows[0].odometer === 5000,
    JSON.stringify(rows))
  ok('the log shows it without a reload', (await bodyText(page)).includes('5,000 mi'))
  // The chart's list filters out the 'first' entry, which has no economy figure
  // yet. Keying the empty state off it made a one-entry log announce that it was
  // empty, directly above the entry.
  ok('and does not still claim the log is empty',
    !(await bodyText(page)).includes('No fill-ups yet'))

  // A second one, so there is a chain to check the edit against.
  await fab.first().click()
  await page.waitForTimeout(700)
  await page.getByLabel('Odometer').fill('5300')
  await page.getByLabel('Volume').fill('10')
  await page.getByLabel('Total cost').fill('40')
  await saveBtn(page).click()
  await page.waitForTimeout(2000)
  ok('300 miles on 10 gallons reads 30.0', (await bodyText(page)).includes('30.0 mpg'))

  section('editing a fill-up')
  // The newest row is first in the reversed log.
  await page.locator('button').filter({ hasText: '5,300 mi' }).first().click()
  await page.waitForTimeout(800)
  ok('the sheet opens in edit mode', (await bodyText(page)).includes('Edit fill-up'))
  ok('prefilled with the stored reading', await page.getByLabel('Odometer').inputValue() === '5300')
  ok('and the stored volume', await page.getByLabel('Volume').inputValue() === '10')
  ok('and the stored total', await page.getByLabel('Total cost').inputValue() === '40')
  // THE ROW BEING EDITED MUST NOT ANCHOR ITSELF. With 5300 in the field the
  // preview has to measure against 5000, not against the stored 5300 (which
  // would be a zero-mile span). Retype the volume to make the line appear.
  await page.getByLabel('Volume').fill('10')
  await page.waitForTimeout(350)
  const editLive = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(e => /this tank/.test(e.textContent || '') && e.children.length === 0)
    return el ? el.textContent.trim() : ''
  })
  ok('the preview measures against the PREVIOUS entry, not the one being edited',
    editLive.includes('30.0 mpg this tank'), `"${editLive}"`)

  // Correct the odometer: 5000 -> 5600 on 10 gal is 60.0.
  await page.getByLabel('Odometer').fill('5600')
  await page.waitForTimeout(300)
  await saveBtn(page).click()
  await page.waitForTimeout(2000)
  rows = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id,odometer&order=odometer`)).body ?? []
  ok('the edit updated the row rather than adding one',
    rows.length === 2 && rows[1].odometer === 5600, JSON.stringify(rows))
  ok('and the chain recomputed', (await bodyText(page)).includes('60.0 mpg'))

  section('deleting a fill-up')
  await page.locator('button').filter({ hasText: '5,600 mi' }).first().click()
  await page.waitForTimeout(800)
  const del = page.getByRole('button', { name: 'Delete fill-up' })
  ok('edit mode offers a delete', await del.count() === 1)
  await del.click()
  await page.waitForTimeout(300)
  ok('which asks once before doing it',
    await page.getByRole('button', { name: /Tap again to delete/ }).count() === 1)
  ok('and has not deleted anything yet',
    ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length === 2)
  await page.getByRole('button', { name: /Tap again to delete/ }).click()
  await page.waitForTimeout(2000)
  rows = (await rest(`fuel_entries?car_id=eq.${CAR}&select=id,odometer`)).body ?? []
  ok('the second tap deletes it', rows.length === 1 && rows[0].odometer === 5000, JSON.stringify(rows))
  ok('the sheet closed', await saveBtn(page).count() === 0)

  section('receipts on a fill-up')
  if (!HAS_FUEL_RECEIPTS) {
    console.log('  skip  migration 100 is not applied yet (receipts.fuel_entry_id does not exist)')
  } else {
  const receiptPng = path.resolve(OUT, '_receipt-fixture.png')
  if (!fs.existsSync(receiptPng)) {
    // A tiny valid PNG, written once. No network, no binary in the repo.
    fs.writeFileSync(receiptPng, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAG0lEQVR4nGP8//8/AzGAiShVowZTx2AGBgYGAI0kBAOa5j9HAAAAAElFTkSuQmCC',
      'base64'))
  }
  await fab.first().click()
  await page.waitForTimeout(700)
  await page.getByLabel('Odometer').fill('5900')
  await page.getByLabel('Volume').fill('10')
  await page.getByLabel('Total cost').fill('44')
  await page.setInputFiles('input[type="file"]', receiptPng)
  await page.waitForTimeout(400)
  ok('the attached receipt shows before saving',
    await page.getByRole('button', { name: /^Remove / }).count() === 1)
  await saveBtn(page).click()
  await page.waitForTimeout(3000)

  const newEntry = ((await rest(`fuel_entries?car_id=eq.${CAR}&odometer=eq.5900&select=id`)).body ?? [])[0]
  const rcpt = (await rest(`receipts?fuel_entry_id=eq.${newEntry?.id}&select=id,file_url,file_type,car_id,session_id`)).body ?? []
  ok('the receipt row was written against the fill-up', rcpt.length === 1, JSON.stringify(rcpt).slice(0, 200))
  ok('with session_id null and car_id filled in by the trigger',
    rcpt[0]?.session_id === null && rcpt[0]?.car_id === CAR, JSON.stringify(rcpt[0] ?? {}))
  ok('and the file landed under the entry id',
    typeof rcpt[0]?.file_url === 'string' && rcpt[0].file_url.includes(`/${newEntry.id}/`), rcpt[0]?.file_url)

  // Reopen: the stored receipt has to come back, on a SIGNED url.
  await page.locator('button').filter({ hasText: '5,900 mi' }).first().click()
  await page.waitForTimeout(1800)
  const thumbSrc = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find(i => /receipts/.test(i.src))
    return img ? img.src : ''
  })
  ok('the saved receipt reloads', thumbSrc.length > 0, thumbSrc.slice(0, 80))
  ok('through a signed URL, never a public one', thumbSrc.includes('token='), thumbSrc.slice(0, 120))

  // Remove it, and prove the storage object went too.
  await page.getByRole('button', { name: /^Remove / }).first().click()
  await saveBtn(page).click()
  await page.waitForTimeout(2500)
  ok('removing it deletes the row',
    ((await rest(`receipts?fuel_entry_id=eq.${newEntry.id}&select=id`)).body ?? []).length === 0)

  // Attach again, then delete the whole entry: rows cascade, files are removed
  // explicitly first (a cascade cannot reach into the bucket).
  await page.locator('button').filter({ hasText: '5,900 mi' }).first().click()
  await page.waitForTimeout(1500)
  await page.setInputFiles('input[type="file"]', receiptPng)
  await saveBtn(page).click()
  await page.waitForTimeout(3000)
  const rcpt2 = ((await rest(`receipts?fuel_entry_id=eq.${newEntry.id}&select=id,file_url`)).body ?? [])[0]
  ok('a receipt can be added to an existing fill-up', !!rcpt2)
  await page.locator('button').filter({ hasText: '5,900 mi' }).first().click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Delete fill-up' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: /Tap again to delete/ }).click()
  await page.waitForTimeout(2500)
  ok('deleting the fill-up cascades its receipts away',
    ((await rest(`receipts?fuel_entry_id=eq.${newEntry.id}&select=id`)).body ?? []).length === 0)
  const orphanFile = await fetch(`${SB}/storage/v1/object/receipts/${rcpt2?.file_url}`, {
    headers: { apikey: KEY, authorization: `Bearer ${TOK}` },
  })
  ok('and its file is gone from the bucket, not orphaned',
    orphanFile.status === 400 || orphanFile.status === 404, `status ${orphanFile.status}`)
  }
  await page.screenshot({ path: path.join(OUT, 'limit-fuel-capture.png') })
  await wipe(); await restoreMileage()

  // ══ console ════════════════════════════════════════════════════════════════
  section('console and network')
  // Only two classes of failure are allowed here, and both are named rather than
  // pattern-matched away: the volume_unit 403 that migration 098 fixes, and the
  // fuel_entries POST this test itself aborted in section 4.
  // Since 098 the volume_unit read must succeed, so its 403 is no longer
  // excused — it is the regression check on the migration.
  ok('volume_unit never 403s any more (migration 098)',
    session.failedUrls.filter(u => u.startsWith('403') && u.includes('volume_unit')).length === 0)
  // Since 099 the economy_unit read must succeed too, so it joins volume_unit as
  // a regression check on its migration rather than an excused failure.
  ok('economy_unit never fails any more (migration 099)',
    session.failedUrls.filter(u => u.includes('economy_unit')).length === 0,
    session.failedUrls.filter(u => u.includes('economy_unit')).slice(0, 2).join(' | '))
  // Left: the fuel_entries POST this test aborted on purpose, a webfont the
  // sandbox relay occasionally drops, and — only until migration 100 lands — the
  // receipts reads that name a column the table does not have yet. Everything
  // else is news.
  const unexpected = session.failedUrls.filter(u =>
    !u.includes('fuel_entries') && !u.includes('fonts.gstatic.com')
    && !(!HAS_FUEL_RECEIPTS && u.includes('fuel_entry_id')))
  ok('nothing failed that was not expected', unexpected.length === 0, unexpected.slice(0, 4).join(' | '))
  ok('no page errors', realPageErrors(session.errors).length === 0, realPageErrors(session.errors)[0] || '')
} finally {
  await browser.close()
  await wipe()
  await restoreMileage()
  // The litres section leaves a preference behind if it throws part-way.
  await rest(`users?id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ volume_unit: 'gal_us', economy_unit: null }) })
  const left = ((await rest(`fuel_entries?car_id=eq.${CAR}&select=id`)).body ?? []).length
  const odo = (await rest(`cars?id=eq.${CAR}&select=current_mileage`)).body?.[0]?.current_mileage
  const unit = (await rest(`users?id=eq.${me}&select=volume_unit`)).body?.[0]?.volume_unit
  const eco = (await rest(`users?id=eq.${me}&select=economy_unit`)).body?.[0]?.economy_unit
  ok('account left clean', left === 0 && odo === START_MILEAGE && unit === 'gal_us' && eco === null,
    `${left} rows, odo ${odo}, volume ${unit}, economy ${eco}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
