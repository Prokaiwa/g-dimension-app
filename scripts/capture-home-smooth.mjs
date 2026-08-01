// Capture the Home map with SUPERSAMPLING, then downscale to store size.
//
//   node scripts/capture-home-smooth.mjs
//
// The Home map carries a fine noise/grain overlay. Rendered at deviceScaleFactor
// 3 (the exact store size) Chromium resolves that noise at one device pixel per
// speckle, and the result reads visibly grainy next to the same screen on a real
// phone, which looks smooth. Capturing at 2x that density and averaging back
// down to 1290x2796 resolves the speckle into tone, which is what the eye sees
// on the device.
//
// Kept separate from capture-store-shots.mjs because it is slow and only one
// screen needs it.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import path from 'node:path'

const BASE = 'http://localhost:5199'
const OUT = path.resolve('design/store-shots/raw/01-home.png')
const TMP = path.resolve('design/store-shots/raw/.home-hi.png')

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 6,           // 2x the store density
  isMobile: true, hasTouch: true, locale: 'en-US',
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
      const body = Buffer.from(await res.arrayBuffer())
      const headers = {}
      res.headers.forEach((v, k) => {
        if (k === 'content-encoding' || k === 'content-length') return
        headers[k] = v
      })
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
await page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: 25_000 })

await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(4500)

// NOTE: do NOT strip the map's noise overlay. It looks like the obvious fix for
// the graininess, and it works — but the map surface underneath is built from
// tiled gradients whose seams the noise exists to hide, so removing it exposes
// a hard checkerboard. Both failures are worth knowing before trying again.
await page.screenshot({ path: TMP })
await browser.close()

// Supersampling alone was not enough: the map's grain is drawn at CSS scale,
// not device scale, so rendering denser makes it sharper rather than finer and
// the downscale preserves it. A small median pass removes the speckle while
// leaving the drawn edges (road, icons, labels) intact — a plain blur softened
// the icons instead.
// Denoise. Note the supersample above CANNOT help on its own: the grain is a
// fixed 240px CSS tile, so raising deviceScaleFactor scales the pattern with it
// and the downscale reproduces exactly the same speckle. median() did not touch
// it either, and blur+resharpen just brought it back. A plain blur is the only
// thing that works, at the cost of some crispness in the road lines.
await sharp(TMP)
  .resize({ width: 1290, height: 2796, kernel: 'lanczos3' })
  .blur(1.7)
  .toFile(OUT)
const m = await sharp(OUT).metadata()
console.log(`${OUT} — ${m.width}x${m.height} (supersampled from 6x)`)
