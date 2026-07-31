// Render a composed store-shot panel HTML to an exact-pixel PNG.
//
// Usage: node scripts/render-store-panel.mjs design/store-shots/panel-01.html
//
// Same container constraints as capture-store-shots.mjs: Chromium has no
// network egress, so Google Fonts is relayed through Node's fetch. Without it
// Anton and Oswald silently fall back and every headline is wrong.
import { chromium } from '@playwright/test'
import path from 'node:path'

const CANVAS = { width: 1290, height: 2796 }

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/render-store-panel.mjs <panel.html>')
  process.exit(1)
}
const abs = path.resolve(file)
const out = abs.replace(/\.html$/, '.png')

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: CANVAS, deviceScaleFactor: 1 })

for (const pattern of ['**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**']) {
  await ctx.route(pattern, async (route) => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), redirect: 'follow' })
      const body = Buffer.from(await res.arrayBuffer())
      const headers = {}
      res.headers.forEach((v, k) => {
        if (k === 'content-encoding' || k === 'content-length') return
        headers[k] = v
      })
      await route.fulfill({ status: res.status, headers, body })
    } catch {
      await route.abort()
    }
  })
}

const page = await ctx.newPage()
await page.goto(`file://${abs}`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(600)

// Clip to the canvas element so the PNG is exactly the store size regardless
// of any page chrome around it.
const el = await page.$('.canvas')
await el.screenshot({ path: out })

await browser.close()
console.log(`${out} — ${CANVAS.width}x${CANVAS.height}`)
