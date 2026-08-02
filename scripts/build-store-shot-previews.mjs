// Turn the rendered store-shot panels into web-sized previews the app can ship.
//
//   node scripts/build-store-shot-previews.mjs
//
// The full 1290x2796 PNGs are the deliverable you upload to App Store Connect
// and Play Console, and they stay gitignored — they are regenerable and would
// add ~1.5MB per panel per iteration to history. These WebP previews are a
// different thing: small enough to commit, good enough to judge a layout on a
// real phone, and they are what /admin/store-shots displays.
//
// They land in src/assets (NOT public/) so Vite content-hashes the emitted
// filenames. The service worker caches same-origin images CacheFirst for 60
// days, which is only safe for URLs whose contents never change. A fixed path
// under public/ meant a re-render never reached anyone who had already loaded
// the page.
//
// sharp is already a dependency (it comes in via the toolchain), so this adds
// nothing to install.
import sharp from 'sharp'
import { readdirSync, mkdirSync } from 'node:fs'
import { statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('design/store-shots')
const OUT = path.resolve('src/assets/store-shots')

// 860px wide is ~2x a phone's rendered width for this gallery, so the preview
// still looks sharp when tapped to full screen, at roughly a tenth the bytes.
// The Play set is a secondary review surface (the Apple panels are the ones
// being designed; Play is a re-layout of the same decisions), so it gets a
// smaller preview to keep the committed bytes down.
const QUALITY = 80
const WIDTHS = [
  { glob: /^panel-\d+\.png$/,      width: 860 },
  { glob: /^play-\d+\.png$/,       width: 620 },
  { glob: /^feature-graphic\.png$/, width: 1024 },
]

mkdirSync(OUT, { recursive: true })

const all = readdirSync(SRC).filter((f) => f.endsWith('.png')).sort()
const panels = all.filter((f) => WIDTHS.some((w) => w.glob.test(f)))
if (panels.length === 0) {
  console.error('No rendered panels found. Run scripts/render-all-panels.mjs first.')
  process.exit(1)
}

let total = 0
for (const file of panels) {
  const width = WIDTHS.find((w) => w.glob.test(file)).width
  const from = path.join(SRC, file)
  const to = path.join(OUT, file.replace(/\.png$/, '.webp'))
  await sharp(from).resize({ width }).webp({ quality: QUALITY }).toFile(to)
  const kb = Math.round(statSync(to).size / 1024)
  total += kb
  console.log(`  ${file} -> ${path.basename(to)}  ${kb}KB`)
}

console.log(`\n${panels.length} previews, ${total}KB total, in src/assets/store-shots/`)
