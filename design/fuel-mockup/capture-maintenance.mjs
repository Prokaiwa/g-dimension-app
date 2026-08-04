// Capture the Maintenance hub with a third FUEL tile, from the LIVE app.
//
//   npm run dev -- --port 5199 &
//   GDIM_EMAIL=... GDIM_PASSWORD=... GDIM_CAR=... node design/fuel-mockup/capture-maintenance.mjs
//
// This drives the real screen and mutates the real DOM rather than painting a
// tile onto a screenshot, because the thing being judged is a LAYOUT question:
// whether the diagonal still reads with three objects on it. A composited
// approximation would beg exactly that question.
//
// THE EXISTING TWO TILES DO NOT MOVE. An earlier pass re-spaced all three onto
// one line, because MaintenancePage.tsx:21-24 places Detailing and Service at
// left 48 / 218 with a +170 step, and a third point on that line lands at 388,
// where 388 + 126 = 514 runs off a 430-wide screen. Re-spacing worked but it
// edited a screen that was already right.
//
// Instead Fuel goes ABOVE and to the right of Service, at left 282 / bottom 200.
// It clears the right edge by 22px and clears Service's icon box vertically, so
// the two never collide even though they overlap horizontally. The arrangement
// reads as a rising staircase rather than a row, which is what the existing pair
// was already doing with its +42 rise. Bottom 246 was the first try and left a
// visible hole between Service and Fuel; 200 closes it without crowding.
//
// Container notes are the same as scripts/capture-store-shots.mjs: Chromium
// cannot egress through the sandbox proxy, so every Supabase and Google Fonts
// request is relayed through Node's fetch, and the cold-launch splash flag is
// seeded before boot.
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.GDIM_BASE || 'http://localhost:5199'
const OUT = path.resolve('design/fuel-mockup')
const VIEWPORT = { width: 430, height: 932 }

// left / bottom for the re-spaced diagonal, in CSS px, matching the shape of
// the TILES array the page already uses.
const LAYOUT = [
  null,                        // Detailing, untouched
  null,                        // Service, untouched
  { left: 282, bottom: 200 },  // Fuel (new)
]

const pump = await readFile(path.join(OUT, 'pump-node.png'))
const pumpSrc = `data:image/png;base64,${pump.toString('base64')}`

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: VIEWPORT, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
})
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
}, process.env.GDIM_CAR)

const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
await page.locator('form button[type="submit"]').click()
await page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: 20_000 })
console.log('signed in')

await page.goto(`${BASE}/maintenance`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(3000)

// Before: the hub exactly as it ships.
await page.screenshot({ path: path.join(OUT, 'maintenance-before.png') })

const injected = await page.evaluate(({ pumpSrc, LAYOUT }) => {
  const tiles = [...document.querySelectorAll('.mnt-tile')]
  if (tiles.length < 2) return { ok: false, found: tiles.length }
  // Clone Service rather than hand-building markup, so the new tile inherits
  // the exact press transform, drop shadow, caption metrics and entry
  // animation the other two use. Anything hand-written would differ subtly and
  // the comparison would be testing my CSS instead of the layout.
  const fuel = tiles[1].cloneNode(true)
  fuel.style.left = LAYOUT[2].left + 'px'
  fuel.style.bottom = LAYOUT[2].bottom + 'px'
  const img = fuel.querySelector('img')
  img.src = pumpSrc; img.alt = 'Fuel'
  // Inset the art the way Detailing does (imgPad 20). The pump is the tallest
  // object of the three and at full tile height it out-weighs the other two.
  const PAD = 14
  img.style.top = PAD + 'px'; img.style.left = PAD + 'px'
  img.style.width = (126 - PAD * 2) + 'px'; img.style.height = (126 - PAD * 2) + 'px'
  const cap = fuel.querySelector('span')
  cap.textContent = 'Fuel'
  // Service pulls its caption UP 20px because its glyph is letterboxed in a
  // square tile with dead space at the foot. The pump fills its box to the
  // bottom edge, so the same offset lands the word on the cabinet. Push it clear.
  cap.style.marginTop = '4px'
  tiles[1].parentNode.appendChild(fuel)
  return { ok: true, found: tiles.length }
}, { pumpSrc, LAYOUT })
console.log('inject:', JSON.stringify(injected))

await page.waitForTimeout(900)
await page.screenshot({ path: path.join(OUT, 'maintenance-fuel.png') })
console.log('   -> maintenance-before.png, maintenance-fuel.png')
await browser.close()
