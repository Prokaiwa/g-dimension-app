// Pick the hero crop now that the photo runs the FULL page height rather than a
// 383px band. The framing is a different problem at the new size: the container
// is 430x932 (ratio 0.46) and the source is 1600x2133 (0.75), so `cover` scales
// by HEIGHT and the whole vertical is visible — which makes objectPosition's Y
// a no-op and its X the only lever. The old 'center 78%' was tuned for a band
// where the opposite was true.
//
//   GDIM_EMAIL=... GDIM_PASSWORD=... node design/fuel-mockup/crop-test.mjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('design/fuel-mockup')
const BASE = 'http://localhost:5199'
const env = Object.fromEntries(
  fs.readFileSync(path.resolve('.env.local'), 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))

// scale + transform-origin now, since objectPosition has no vertical lever here.
const VARIANTS = [
  { name: 'e', scale: 1.9, origin: '30% 72%' },
  { name: 'f', scale: 1.7, origin: '32% 76%' },
  { name: 'g', scale: 2.1, origin: '28% 70%' },
  { name: 'h', scale: 1.5, origin: '34% 74%' },
]

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US',
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
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(process.env.GDIM_EMAIL)
await page.locator('input[type="password"]').fill(process.env.GDIM_PASSWORD)
await page.locator('form button[type="submit"]').click()
await page.waitForURL(u => !/\/login$/.test(u.pathname), { timeout: 25_000 })

await page.goto(`${BASE}/fuel`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)

// Where the photo actually lands, measured rather than guessed.
const geom = await page.evaluate(() => {
  const img = document.querySelector('img[aria-hidden="true"]')
  const r = img.getBoundingClientRect()
  return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, natural: `${img.naturalWidth}x${img.naturalHeight}` }
})
console.log(`img box ${geom.box}, source ${geom.natural}`)

for (const v of VARIANTS) {
  await page.evaluate(({ scale, origin }) => {
    const img = document.querySelector('img[aria-hidden="true"]')
    img.style.transform = `scale(${scale})`
    img.style.transformOrigin = origin
  }, v)
  await page.waitForTimeout(280)
  await page.screenshot({ path: path.join(OUT, `crop-${v.name}.png`) })
  console.log(`  ${v.name}  scale ${v.scale}  origin ${v.origin}`)
}
await browser.close()
