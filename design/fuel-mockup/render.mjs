import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
const DIR = path.resolve('design/fuel-mockup')
const browser = await chromium.launch({ executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await browser.newContext({ viewport: { width: 1170, height: 2317 }, deviceScaleFactor: 1 })
for (const p of ['**://fonts.googleapis.com/**','**://fonts.gstatic.com/**']) {
  await ctx.route(p, async route => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), redirect: 'follow' })
      const body = Buffer.from(await res.arrayBuffer()); const h = {}
      res.headers.forEach((v,k)=>{ if(k==='content-encoding'||k==='content-length')return; h[k]=v })
      await route.fulfill({ status: res.status, headers: h, body })
    } catch { await route.abort() }
  })
}
const page = await ctx.newPage()
for (const f of readdirSync(DIR).filter(f => f.endsWith('.html')).sort()) {
  const abs = path.join(DIR, f)
  await page.goto(`file://${abs}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  const el = await page.$('.canvas')
  const out = abs.replace(/\.html$/, '.png')
  await el.screenshot({ path: out })
  console.log('  ', f, '->', path.basename(out))
}
await browser.close()
