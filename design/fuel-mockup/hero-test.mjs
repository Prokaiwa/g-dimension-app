// Render the fuel page hero with each candidate photo, side by side.
//
//   node design/fuel-mockup/hero-test.mjs
//
// A hero photo cannot be judged as a photo. It has to be judged inside the
// S-curve clip, under the golden tint, next to the amber panel, at the size it
// will actually be seen. Every candidate so far has looked good in the camera
// roll and different in the wedge.
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const DIR = path.resolve('design/fuel-mockup')
// The tint is the variable, not just the photo. Maintenance's recipe (image at
// 0.55, golden overlay at 0.82) was tuned against a MID-TONE shop interior. Run
// it over a night exposure and the photo disappears: the overlay is nearly
// opaque and there is no highlight left underneath to punch through it. So each
// candidate gets both the stock recipe and one opened up for a dark frame.
// The other three heroes are IDENTICAL in recipe: image opacity 0.55 under a
// tint at 0.82, with only the hue changing per section.
//   Maintenance  rgba(200,140,8,.82)     golden
//   Detailing    rgba(18,72,140,.82)     blue
//   Service      rgba(165,180,195,.82)   cool grey
// So the question is not whether to match them, it is whether 0.55/0.82 hides
// the branding on its own. Opacity and tint cut CONTRAST; blur destroys detail.
// Those are different tools and only one of them reliably kills small lettering.
const stock = (rgb) => `
  .hero img { opacity:0.55 !important; }
  .hero .tint { background:linear-gradient(160deg, rgba(${rgb},0.82) 0%, rgba(130,75,10,0.70) 50%, rgba(0,0,0,0) 100%) !important; }
`
const OPEN_UP = `
  .hero img { opacity:0.92 !important; }
  .hero .tint { background:linear-gradient(160deg, rgba(200,140,8,0.40) 0%, rgba(130,75,10,0.34) 50%, rgba(0,0,0,0) 100%) !important; }
`
// A ladder between the family recipe and a photo you can actually see, all on
// the UNBLURRED original, to find where the lettering stops being legible.
const mix = (op, tn) => `
  .hero img { opacity:${op} !important; }
  .hero .tint { background:linear-gradient(160deg, rgba(200,140,8,${tn}) 0%, rgba(130,75,10,${(tn*0.85).toFixed(2)}) 50%, rgba(0,0,0,0) 100%) !important; }
`
const CANDIDATES = [
  { id: 'm55', src: '_hero-a.jpeg', note: '0.55 / 0.82  (family recipe)', tune: mix(0.55, 0.82) },
  { id: 'm65', src: '_hero-a.jpeg', note: '0.65 / 0.74',                  tune: mix(0.65, 0.74) },
  { id: 'm75', src: '_hero-a.jpeg', note: '0.75 / 0.66',                  tune: mix(0.75, 0.66) },
  { id: 'm85', src: '_hero-a.jpeg', note: '0.85 / 0.54',                  tune: mix(0.85, 0.54) },
]
const src = readFileSync(path.join(DIR, 'history.html'), 'utf8')

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
const tiles = []
for (const c of CANDIDATES) {
  const html = src
    .replace(/src="_hero-[^"]*"/, `src="${c.src}"`)   // must match whatever history.html currently points at
    .replace('</style>', `${c.tune || ''}
.tag { position:absolute; left:0; right:0; bottom:12px; text-align:center; z-index:20;
        font-family:'Hanken Grotesk',sans-serif; font-weight:700; font-size:22px;
        letter-spacing:0.10em; color:rgba(228,232,236,0.45); }\n</style>`)
    .replace('</div>\n</body>', `  <div class="tag">${c.note}</div>\n</div>\n</body>`)
  const tmp = path.join(DIR, `_hero-${c.id}.html`)
  writeFileSync(tmp, html)
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const out = path.join(DIR, `hero-${c.id}.png`)
  await (await page.$('.canvas')).screenshot({ path: out })
  unlinkSync(tmp)
  tiles.push(await sharp(out).resize(430).png().toBuffer())
  console.log('  ', c.id, '->', path.basename(out))
}
await browser.close()

const m = await sharp(tiles[0]).metadata()
await sharp({ create: { width: m.width * tiles.length + 24 * (tiles.length - 1), height: m.height, channels: 3, background: { r: 10, g: 10, b: 12 } } })
  .composite(tiles.map((input, i) => ({ input, left: i * (m.width + 24), top: 0 })))
  .png().toFile(path.join(DIR, 'hero-compare.png'))
console.log('   -> hero-compare.png')
