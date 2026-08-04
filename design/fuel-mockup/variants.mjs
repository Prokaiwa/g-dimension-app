// Render the fuel stop at several candidate positions on the Home map.
//
//   node design/fuel-mockup/variants.mjs
//
// Placement is the one thing that cannot be argued about in the abstract, so
// this stamps the same pump into every plausible pocket and lets them be looked
// at side by side. Coordinates below are in HOME-MAP space (the raw screenshot),
// and converted to canvas space at render time, because every measurement that
// justifies them was taken off the screenshot.
//
// Measurements the options are built from, all in home-map space:
//
//   left road    y=750 x=455  800 x=383  850 x=320  900 x=270
//                y=950 x=234  1000 x=205 1050 x=193 1100 x=199  1150 x=217
//   right road   y=800 x=842  850 x=896  900 x=932  950 x=942
//                y=1000 x=917 1050 x=862 1100 x=842 1150 x=854
//   house        x 441-721   y 512-751
//   HOME caption x 511-651   y 856-889
//   Timeline     x 175-379   y 1147-1293
//   Tuning       x 773-978   y 1124-1328
//   "To Timeline" script  x 181-315  y 844-978   (OUTSIDE the loop)
//   "To Maintenance"      x 960-1007 y 1305-1503 (OUTSIDE the loop)
//
// The scripts are what make the outside of the loop tight: the left band is only
// ~180px wide by the time it clears them, which is narrower than the pump's
// caption.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const DIR = path.resolve('design/fuel-mockup')
const MAP_SHIFT = 60          // map.html lifts the screenshot to drop the header sliver
const PUMP_W = 130, PUMP_H = 222
const LABEL_W = 184, LABEL_DROP = 71   // caption offset below the base, as on map.html

// centreX / baseY are where the pump STANDS, in home-map space.
const OPTIONS = [
  { id: 'a-outside-left', centreX: 235, baseY: 700,
    note: 'A — outside the loop, left of the Home/Timeline road' },
  { id: 'b-inside-tuning', centreX: 690, baseY: 1150,
    note: 'B — inside the loop, between Home and Tuning' },
  { id: 'c-outside-right', centreX: 1040, baseY: 1010,
    note: 'C — outside the loop, right of the Home/Tuning road' },
  { id: 'd-inside-timeline', centreX: 475, baseY: 1195,
    note: 'D — inside the loop, between Home and Timeline (current)' },
]

const src = readFileSync(path.join(DIR, 'map.html'), 'utf8')

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1170, height: 2317 }, deviceScaleFactor: 1 })
for (const p of ['**://fonts.googleapis.com/**', '**://fonts.gstatic.com/**']) {
  await ctx.route(p, async (route) => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), { method: req.method(), headers: req.headers(), redirect: 'follow' })
      const body = Buffer.from(await res.arrayBuffer()); const h = {}
      res.headers.forEach((v, k) => { if (k === 'content-encoding' || k === 'content-length') return; h[k] = v })
      await route.fulfill({ status: res.status, headers: h, body })
    } catch { await route.abort() }
  })
}
const page = await ctx.newPage()

for (const o of OPTIONS) {
  const stopLeft = o.centreX - PUMP_W / 2
  const stopTop = o.baseY - MAP_SHIFT - PUMP_H
  const labLeft = o.centreX - LABEL_W / 2
  const labTop = o.baseY - MAP_SHIFT + LABEL_DROP

  const html = src
    .replace(/\.stop \{ position:absolute; left:\d+px; top:\d+px;/,
             `.stop { position:absolute; left:${stopLeft}px; top:${stopTop}px;`)
    .replace(/(\.stop-label \{\s*position:absolute; )left:\d+px; top:\d+px;/,
             `$1left:${labLeft}px; top:${labTop}px;`)
    // A caption in the dead black band the 60px shift opens at the foot, so four
    // near-identical renders can be told apart without opening the filenames.
    .replace('</style>',
      `.tag { position:absolute; left:0; right:0; bottom:14px; text-align:center; z-index:9;
              font-family:'Hanken Grotesk',sans-serif; font-weight:700; font-size:22px;
              letter-spacing:0.10em; color:rgba(228,232,236,0.40); }\n</style>`)
    .replace('</div>\n</body>', `  <div class="tag">${o.note}</div>\n</div>\n</body>`)

  const tmp = path.join(DIR, `_var-${o.id}.html`)
  writeFileSync(tmp, html)
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  const out = path.join(DIR, `option-${o.id}.png`)
  await (await page.$('.canvas')).screenshot({ path: out })
  unlinkSync(tmp)
  console.log('  ', o.id, '->', path.basename(out))
}
await browser.close()

// One contact sheet, because placement is only decidable by comparison.
const tiles = []
for (const o of OPTIONS) {
  tiles.push(await sharp(path.join(DIR, `option-${o.id}.png`)).resize(560).png().toBuffer())
}
const t0 = await sharp(tiles[0]).metadata()
const GAP = 22
await sharp({ create: {
  width: t0.width * tiles.length + GAP * (tiles.length - 1),
  height: t0.height, channels: 3, background: { r: 10, g: 10, b: 12 },
} })
  .composite(tiles.map((input, i) => ({ input, left: i * (t0.width + GAP), top: 0 })))
  .png().toFile(path.join(DIR, 'options.png'))
console.log('   contact sheet -> options.png')
