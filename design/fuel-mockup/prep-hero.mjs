// Prepare a fuel hero photo for the /fuel page.
//
//   node design/fuel-mockup/prep-hero.mjs                 # review copy only
//   node design/fuel-mockup/prep-hero.mjs --ship          # also write the real asset
//
// Two jobs.
//
// 1. KILL THE BRANDING. The candidate carries "CIRCLE K" on three pump toppers,
//    "99¢" price signs under each, "NON ETHANOL" down the pump flanks, and a lit
//    business sign at the right edge. All of it falls in one horizontal band. A
//    third party's wordmark in app chrome is a trademark exposure and an easy
//    complaint vector in an App Store listing, and Circle K's mark is registered
//    and enforced.
//
//    The band is BLURRED rather than cloned out. At this scale a blur reads as
//    depth of field, which is what a wide aperture would have done anyway, and
//    it keeps the orange colour blocks that make the photo sit in the palette.
//    Cloning would leave suspiciously empty pump toppers.
//
//    The blur is feathered top and bottom. A hard-edged band would draw the eye
//    straight to the thing it is hiding, and the mountain ridge sits just above
//    it (its base measures y~2020), so an abrupt seam would cut the horizon.
//
// 2. SIZE IT. The family sits around 363 KB (maintenance_hero.webp, 2048x1365).
//    Matching its 2048 LONG EDGE does not match its weight: this frame is
//    PORTRAIT, so 2048 wide means 2048x2731, twice the pixels of a landscape
//    hero, and it encoded to 892 KB — heavier than every other background in the
//    app combined with the icon set.
//
//    So match the WEIGHT instead. 1600 wide lands at 329 KB, and 1600 is still
//    more than any phone asks for: the widest supported screen is 430pt at 3x,
//    i.e. 1290 device px, and this photo is then covered by a 0.54 tint at 0.85
//    opacity. Quality 72 is invisible under that.
import sharp from 'sharp'
import path from 'node:path'

const SRC = path.resolve('design/fuel-mockup/_hero-a.jpeg')
const REVIEW = path.resolve('design/fuel-mockup/_hero-a-clean.jpeg')
const SHIP = path.resolve('src/assets/backgrounds/fuel_hero.webp')

// In source pixels, measured off the 3024x4032 original. The marks are spread
// down the whole pump, not just across the toppers, which the first pass missed:
//   business sign, right edge   2001-2040
//   CIRCLE K toppers            2043-2076
//   99c price signs             2117-2160
//   ETHANOL down the flanks     2150-2303
//   roundel + Quality Guaranteed on the pump body   2377-2477
// So the band has to run to ~2500, not to 2235. Everything below that is
// asphalt.
const BAND = { top: 1975, height: 530 }
const FEATHER = 90          // px of ramp at each edge of the band
const BLUR = 11             // enough to destroy 30px lettering at full size

const meta = await sharp(SRC).metadata()
const W = meta.width, H = meta.height

const original = await sharp(SRC).toColourspace('srgb').removeAlpha().toBuffer()
const blurred = await sharp(original).blur(BLUR).toBuffer()

// Feathered mask: opaque across the band, ramping to nothing over FEATHER px so
// the transition never announces itself.
//
// The mask MUST be RGBA with the value in the ALPHA channel. An earlier version
// passed a 1-channel raw buffer and expected 'dest-in' to read it as coverage.
// sharp treats 1-channel input as greyscale with no alpha, i.e. fully opaque
// everywhere, so dest-in kept the blurred layer across the WHOLE frame and the
// luminance mask was simply ignored. The band looked correct, so the bug hid:
// the only way to catch it was to measure detail somewhere the band does not
// reach. Sharpness in the canopy (a mean absolute Laplacian over source
// y 1150-1650) had fallen from 18.88 to 0.76, a 96% loss.
const mask = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) {
  const d = y - BAND.top
  let a = 0
  if (d >= 0 && d <= BAND.height) a = 255
  else if (d < 0 && d > -FEATHER) a = Math.round(255 * (1 + d / FEATHER))
  else if (d > BAND.height && d < BAND.height + FEATHER) a = Math.round(255 * (1 - (d - BAND.height) / FEATHER))
  if (!a) continue
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    mask[i] = 255; mask[i + 1] = 255; mask[i + 2] = 255; mask[i + 3] = a
  }
}
const blurredWithAlpha = await sharp(blurred)
  .ensureAlpha()
  .composite([{ input: mask, raw: { width: W, height: H, channels: 4 }, blend: 'dest-in' }])
  .png().toBuffer()

const merged = await sharp(original).composite([{ input: blurredWithAlpha }]).toBuffer()

await sharp(merged).jpeg({ quality: 92 }).toFile(REVIEW)
console.log(`${path.basename(REVIEW)} — ${W}x${H}, band ${BAND.top}-${BAND.top + BAND.height} blurred`)

if (process.argv.includes('--ship')) {
  await sharp(merged).resize({ width: 1600 }).webp({ quality: 72, effort: 6 }).toFile(SHIP)
  const m = await sharp(SHIP).metadata()
  const bytes = (await import('node:fs')).statSync(SHIP).size
  console.log(`${SHIP} — ${m.width}x${m.height}, ${bytes.toLocaleString()} bytes`)
}
