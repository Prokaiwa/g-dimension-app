// Shoot the SHIPPED pages, not the mockup.
//
//   npm run dev -- --port 5199 &
//   GDIM_EMAIL=... GDIM_PASSWORD=... node design/fuel-mockup/capture-live.mjs
//
// The mockup is a drawing of an intention; this is what the code actually
// renders, including the empty states a new user meets first.
import { chromium } from '@playwright/test'
import path from 'node:path'

const BASE = process.env.GDIM_BASE || 'http://localhost:5199'
const OUT = path.resolve('design/fuel-mockup')
const SHOTS = [
  { name: 'live-maintenance', path: '/maintenance' },
  { name: 'live-fuel', path: '/fuel' },
]

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US',
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
page.on('console', m => m.type() === 'error' && console.log('  [console]', m.text().slice(0, 200)))
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)))

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
await page.locator('form button[type="submit"]').click()
await page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: 20_000 })
console.log('signed in')

for (const s of SHOTS) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`) })
  console.log('  ', s.name)
}
await browser.close()
