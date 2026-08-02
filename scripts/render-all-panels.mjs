// Render every store-shot panel, then the contact sheet that shows them all.
//
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
//     node scripts/render-all-panels.mjs
//
// Same font-relay constraint as the other capture scripts: Chromium has no
// network egress here, so Google Fonts is proxied through Node's fetch or
// Anton and Oswald fall back and every headline renders with wrong metrics.
import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'
import path from 'node:path'

const DIR = path.resolve('design/store-shots')

// Every deliverable size. Apple 6.9" and Play phone are different LAYOUTS, not
// different scales of one layout — Play is 1.78:1 against Apple's 2.17:1, so a
// scaled Apple panel loses its bottom fifth. See play.css.
const TARGETS = [
  { glob: /^panel-\d+\.html$/,     w: 1290, h: 2796, label: 'Apple 6.9"' },
  { glob: /^play-\d+\.html$/,      w: 1080, h: 1920, label: 'Play phone' },
  { glob: /^feature-graphic\.html$/, w: 1024, h: 500,  label: 'Play feature graphic' },
]
const CANVAS = { width: 1290, height: 2796 }

async function installFontRelay(ctx) {
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
}

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

// ── Panels, at every target size ──────────────────────────────────────────
let panels = []
for (const target of TARGETS) {
  const files = readdirSync(DIR).filter((f) => target.glob.test(f)).sort()
  if (files.length === 0) continue
  console.log(`\n${target.label} — ${target.w}x${target.h}`)
  const ctx = await browser.newContext({
    viewport: { width: target.w, height: target.h }, deviceScaleFactor: 1,
  })
  await installFontRelay(ctx)
  const page = await ctx.newPage()
  for (const file of files) {
    const abs = path.join(DIR, file)
    await page.goto(`file://${abs}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
    const el = await page.$('.canvas')
    const out = abs.replace(/\.html$/, '.png')
    await el.screenshot({ path: out })
    console.log(`  ${file} -> ${path.basename(out)}  ${target.w}x${target.h}`)
  }
  await ctx.close()
  panels = panels.concat(files)
}

// ── Contact sheet ─────────────────────────────────────────────────────────
// Rendered wide and full-page so the whole strip lands in one image.
const sheetCtx = await browser.newContext({ viewport: { width: 2000, height: 900 }, deviceScaleFactor: 1 })
await installFontRelay(sheetCtx)
const sheet = await sheetCtx.newPage()
await sheet.goto(`file://${path.join(DIR, 'index.html')}`, { waitUntil: 'networkidle' })
await sheet.evaluate(() => document.fonts.ready)
await sheet.waitForTimeout(500)
await sheet.screenshot({ path: path.join(DIR, 'contact-sheet.png'), fullPage: true })
console.log('  index.html -> contact-sheet.png')

await browser.close()
console.log(`\nDone. ${panels.length} panels + contact sheet in design/store-shots/`)
