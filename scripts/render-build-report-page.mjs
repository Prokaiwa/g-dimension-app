// Render page 1 of the generated Build Report PDF to a PNG the compositor can
// use, so the "when you sell" panel can show the ACTUAL document rather than
// the screen you press to make it.
//
//   node scripts/render-build-report-page.mjs [pageNumber]
//
// Input:  design/store-shots/raw/build-report.pdf  (produced by
//         scripts/capture-build-report-pdf.mjs)
// Output: design/store-shots/raw/build-report-p<N>.png
//
// This container has no poppler and no ghostscript, and pdfjs-dist would need
// a native canvas to render in Node. Chromium's OWN pdf viewer works headlessly
// though, and it honours the Adobe open-parameters fragment, so the viewer
// chrome can be switched off and the page screenshotted directly. That keeps
// the pipeline dependency-free.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import path from 'node:path'

const pageNo = Number(process.argv[2] || 1)
const pdf = path.resolve('design/store-shots/raw/build-report.pdf')
const out = path.resolve(`design/store-shots/raw/build-report-p${pageNo}.png`)

if (!existsSync(pdf)) {
  console.error('No build-report.pdf. Run scripts/capture-build-report-pdf.mjs first.')
  process.exit(1)
}

// The viewer ignores both `view=Fit` and `zoom=fit` from the fragment here and
// keeps its own zoom, so instead of fighting it, give it a window comfortably
// larger than the page at that zoom. The page then sits fully inside the
// viewport, centred on the viewer's dark surround, and sharp.trim() isolates
// it exactly. Sizing the window to the page ratio (the obvious move) cropped
// the right-hand column off every render.
// navpanes=0 is ALSO ignored, so the thumbnail sidebar stays and eats the left
// ~700 CSS px, squeezing the page off the right edge. Rather than fight the
// viewer, make the window wide enough that the page still fits beside the
// sidebar; trim() then discards both the sidebar and the surround.
const W = 2600
const H = 2000

const browser = await chromium.launch({
  executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(`file://${pdf}#page=${pageNo}&toolbar=0&navpanes=0&scrollbar=0`, {
  waitUntil: 'load',
  timeout: 45_000,
})
// The viewer streams and paints asynchronously; there is no load event for
// "page rasterised", so wait it out.
await page.waitForTimeout(9000)

const shot = path.resolve('design/store-shots/raw/.pdf-raw.png')
await page.screenshot({ path: shot })
await browser.close()

// Trim the viewer's dark surround. The page itself is a warm off-white
// (#f4f4f2 in buildPdf.ts), so a plain trim on the dark background isolates it.
// The viewer scrolls continuously, so a trim alone spans page 1 AND whatever
// of page 2 is on screen — crop back to a single US Letter page.
const trimmed = await sharp(shot).trim({ threshold: 40 }).toBuffer()
const t = await sharp(trimmed).metadata()
const pageH = Math.min(t.height, Math.round(t.width * 11 / 8.5))
await sharp(trimmed)
  .extract({ left: 0, top: 0, width: t.width, height: pageH })
  .toFile(out)

const meta = await sharp(out).metadata()
console.log(`${out} — ${meta.width}x${meta.height}`)
