// Generate the Android notification small icon set (ic_stat_icon) at every
// density, from the G badge in src/assets/logo/.
//
// WHY THIS IS NOT JUST A RESIZE. Android does not draw a notification small
// icon as supplied: it takes the ALPHA CHANNEL ONLY and paints it a flat
// colour, discarding every RGB value. The G badge is a burgundy shield with the
// letter knocked out of it in cream, and both are fully opaque, so feeding the
// badge in directly produces a solid white blob with no G in it at all. The
// letter has to become the OPAQUE part and the shield has to become
// transparent, which is what the luminance threshold below does.
//
// Requires macOS `sips` to decode the .webp source (jimp cannot read webp).
// This is a local asset-generation script, like scripts/render-all-panels.mjs;
// it is deliberately NOT part of `npm run verify`, which has to pass in CI.
//
// Run: node scripts/make-notification-icon.mjs
//
// Referenced by src/lib/reminderNotifications.ts as `smallIcon: 'ic_stat_icon'`.
// Without these files Android renders a blank square in the status bar, which
// is what shipped until 2026-08.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'src/assets/logo/gdimensionG.webp')
const RES = join(ROOT, 'android/app/src/main/res')
const TMP = join(ROOT, 'node_modules/.cache/gdim-notif-icon')

// Android's density buckets for a 24dp notification icon.
const DENSITIES = [
  ['mdpi', 24],
  ['hdpi', 36],
  ['xhdpi', 48],
  ['xxhdpi', 72],
  ['xxxhdpi', 96],
]

// The cream letterform sits far above this; the burgundy shield far below.
// Anything in between is an antialiased edge pixel and keeps its softness,
// which is what stops the 24px version looking like it was cut with scissors.
const LUMA_CUT = 140

// Fraction of the canvas the glyph occupies. Android's own spec insets the
// artwork slightly inside the 24dp box so it never collides with the status
// bar's other icons.
const FILL = 0.86

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

async function main() {
  if (!existsSync(SOURCE)) throw new Error(`missing source: ${SOURCE}`)
  mkdirSync(TMP, { recursive: true })

  // webp -> png, because jimp cannot decode webp.
  const decoded = join(TMP, 'source.png')
  execFileSync('sips', ['-s', 'format', 'png', SOURCE, '--out', decoded], { stdio: 'ignore' })

  const src = await Jimp.read(decoded)
  const { width: w, height: h, data } = src.bitmap

  // Pass 1: build the mask, and record the glyph's bounding box as we go so the
  // letter can be cropped out of the shield and recentred rather than sitting
  // wherever it happened to be on the source canvas.
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) << 2
      const alpha = data[i + 3]
      // Transparent in the source stays transparent: that is the area around
      // the shield, not part of the mark.
      let out = 0
      if (alpha > 8) {
        const l = luma(data[i], data[i + 1], data[i + 2])
        // Scale across the cut rather than hard-switching, so edge pixels keep
        // partial alpha and the small sizes stay smooth.
        out = Math.max(0, Math.min(255, Math.round(((l - LUMA_CUT) / (255 - LUMA_CUT)) * 255)))
        // Weight by the source's own alpha so a soft outer edge cannot become
        // a hard one.
        out = Math.round((out * alpha) / 255)
      }
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255 // colour is discarded by Android anyway
      data[i + 3] = out
      if (out > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) throw new Error('threshold produced an empty mask; check LUMA_CUT')

  const gw = maxX - minX + 1
  const gh = maxY - minY + 1
  src.crop({ x: minX, y: minY, w: gw, h: gh })
  console.log(`glyph extracted: ${gw}x${gh} from ${w}x${h}`)

  for (const [density, size] of DENSITIES) {
    const box = Math.round(size * FILL)
    // Preserve aspect ratio inside the square canvas.
    const scale = Math.min(box / gw, box / gh)
    const tw = Math.max(1, Math.round(gw * scale))
    const th = Math.max(1, Math.round(gh * scale))

    const glyph = src.clone().resize({ w: tw, h: th })
    const canvas = new Jimp({ width: size, height: size, color: 0x00000000 })
    canvas.composite(glyph, Math.round((size - tw) / 2), Math.round((size - th) / 2))

    const dir = join(RES, `drawable-${density}`)
    mkdirSync(dir, { recursive: true })
    await canvas.write(join(dir, 'ic_stat_icon.png'))
    console.log(`  drawable-${density}/ic_stat_icon.png  ${size}x${size} (glyph ${tw}x${th})`)
  }

  rmSync(TMP, { recursive: true, force: true })
  console.log('\nDone. Rebuild and sync before this reaches a device:')
  console.log('  npm run build && npx cap sync android')
}

main().catch(err => { console.error(err); process.exit(1) })
