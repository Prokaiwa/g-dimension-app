// Build the Play Store listing icon (512 × 512).
//
//   node scripts/build-store-icon.mjs
//
// Deliberately NOT a new design. The icon that ships on device — the Android
// launcher icon in mipmap-*/ic_launcher.png and the PWA icon at
// public/icon-512.png — is the burgundy shield G on a near-black field, and a
// store listing icon that differs from the installed one costs recognition for
// nothing. So this derives from the same source.
//
// What it does change is compliance:
//   - FLATTENS the alpha channel. Play's listing icon is composited on a
//     background Play chooses and then masked to a rounded square by Play
//     itself; a transparent source can come back with white or black fringing
//     depending on the surface. An opaque square is unambiguous.
//   - Guarantees exactly 512 × 512 sRGB PNG, which is the spec.
//
// Do NOT round the corners here. Play applies its own shape, and pre-rounded
// corners get rounded twice — the classic double-mask that leaves grey wedges
// in each corner.
import sharp from 'sharp'
import path from 'node:path'

const SRC = path.resolve('public/icon-512.png')
const OUT = path.resolve('design/store-shots/play-icon-512.png')

// The field the on-device icons already sit on.
const FIELD = { r: 8, g: 8, b: 10 }

await sharp(SRC)
  .resize(512, 512, { fit: 'cover' })
  .flatten({ background: FIELD })
  .png({ compressionLevel: 9 })
  .toFile(OUT)

const m = await sharp(OUT).metadata()
console.log(`${OUT} — ${m.width}x${m.height}, ${m.channels}ch, alpha=${!!m.hasAlpha}`)
