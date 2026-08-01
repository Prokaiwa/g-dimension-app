// Render a page of the generated Build Report PDF to a PNG the compositor can
// use, so the "when you sell" panel shows the ACTUAL document rather than the
// screen you press to make it.
//
//   node scripts/render-build-report-page.mjs [pageNumber]
//
// Input:  design/store-shots/raw/build-report.pdf
// Output: design/store-shots/raw/build-report-p<N>.png
//
// This container has no poppler and no ghostscript, and pdfjs-dist would need a
// native canvas to render in Node. Chromium's own PDF plugin works headlessly,
// so that is what this drives.
//
// What does NOT work, recorded so it is not retried:
//   - Top-level navigation to the file:// PDF. The viewer keeps its own zoom
//     and ignores `view=Fit`, `zoom=fit` AND `navpanes=0`, so the thumbnail
//     sidebar stays, eats a growing share of the window, and pushes the page
//     off the right edge. Widening the window widened the sidebar with it.
//   - Sizing any window to the page's own 8.5:11 ratio. That guarantees a clip,
//     because the plugin renders at a fixed zoom rather than fitting.
//
// What works: an <embed>, which has no sidebar, made comfortably LARGER than
// the page renders at that fixed zoom. The page then sits fully inside with
// margin on all sides, and the light page is isolated from the dark surround
// by scanning for its bounds rather than trusting sharp's trim (trim latched
// onto the clipped region in the top-level case and silently cropped content).
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const pageNo = Number(process.argv[2] || 1)
const pdf = path.resolve('design/store-shots/raw/build-report.pdf')
const out = path.resolve(`design/store-shots/raw/build-report-p${pageNo}.png`)
const holder = path.resolve('design/store-shots/.pdf-embed.html')
const shot = path.resolve('design/store-shots/raw/.embed.png')

if (!existsSync(pdf)) {
  console.error('No build-report.pdf. Generate it first (see BUILD_NOTES / the capture script).')
  process.exit(1)
}

writeFileSync(holder, `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#222}
embed{display:block;width:1800px;height:2340px;border:0}</style></head>
<body><embed id="e" src="raw/build-report.pdf#toolbar=0&navpanes=0&scrollbar=0&page=${pageNo}" type="application/pdf"></body></html>`)

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 1900, height: 2450 }, deviceScaleFactor: 1.6 })
const page = await ctx.newPage()
await page.goto(`file://${holder}`, { waitUntil: 'load', timeout: 45_000 })
// The plugin streams and paints asynchronously with no event to wait on.
await page.waitForTimeout(10_000)
await page.locator('#e').screenshot({ path: shot })
await browser.close()

// Locate the page: it is a warm off-white (#f4f4f2 in buildPdf.ts) on the
// plugin's dark surround.
const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
const ch = info.channels
const isLight = (x, y) => {
  const i = (y * info.width + x) * ch
  return (data[i] + data[i + 1] + data[i + 2]) / 3 > 110
}
let left = info.width, right = -1, top = info.height, bottom = -1
for (let y = 0; y < info.height; y += 2) {
  for (let x = 0; x < info.width; x += 2) {
    if (!isLight(x, y)) continue
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
}
const width = right - left + 1
// Clamp to one US Letter page: the plugin scrolls continuously, so the visible
// light region can run into the next page.
const height = Math.min(bottom - top + 1, Math.round(width * 11 / 8.5))

await sharp(shot).extract({ left, top, width, height }).toFile(out)
unlinkSync(shot)
unlinkSync(holder)

const meta = await sharp(out).metadata()
console.log(`${out} — ${meta.width}x${meta.height}`)
