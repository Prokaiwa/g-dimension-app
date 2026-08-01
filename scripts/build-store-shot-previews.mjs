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
// sharp is already a dependency (it comes in via the toolchain), so this adds
// nothing to install.
import sharp from 'sharp'
import { readdirSync, mkdirSync } from 'node:fs'
import { statSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('design/store-shots')
const OUT = path.resolve('public/store-shots')

// 860px wide is ~2x a phone's rendered width for this gallery, so the preview
// still looks sharp when tapped to full screen, at roughly a tenth the bytes.
const WIDTH = 860
const QUALITY = 80

mkdirSync(OUT, { recursive: true })

const panels = readdirSync(SRC).filter((f) => /^panel-\d+\.png$/.test(f)).sort()
if (panels.length === 0) {
  console.error('No rendered panels found. Run scripts/render-all-panels.mjs first.')
  process.exit(1)
}

let total = 0
for (const file of panels) {
  const from = path.join(SRC, file)
  const to = path.join(OUT, file.replace(/\.png$/, '.webp'))
  await sharp(from).resize({ width: WIDTH }).webp({ quality: QUALITY }).toFile(to)
  const kb = Math.round(statSync(to).size / 1024)
  total += kb
  console.log(`  ${file} -> ${path.basename(to)}  ${kb}KB`)
}

console.log(`\n${panels.length} previews, ${total}KB total, in public/store-shots/`)
