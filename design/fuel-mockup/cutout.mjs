// Cut the studio background off the hand-made fuel-pump node.
//
//   node design/fuel-mockup/cutout.mjs [in.png] [out.png]
//
// MOCKUP GRADE. The app's real background remover (RMBG-1.4 via Transformers.js,
// src/lib/backgroundRemoval.ts) can't run in this container — the sandbox proxy
// denies huggingface.co, so the model weights can't be fetched. This exists so
// placement can be judged on the map. Redo the shipping asset with the real
// remover, or by hand, before it goes anywhere near production.
//
// A brushed-steel object on a brushed-steel backdrop is close to the worst case
// for classical matting: large parts of the subject sit at the SAME luminance as
// the field (measured: some pump pixels are within 1.2 levels of it). No
// threshold separates them. What does separate them is topology — the field is
// one region touching the frame, and the pump is ringed by its own darker
// outline — so this floods inward from the frame and keeps whatever the flood
// cannot reach.
//
// Four things this had to learn the hard way, each one a failed run:
//
//   1. The field is a smooth gradient, not a colour, so the test has to be
//      distance from a per-pixel ESTIMATE. The subject never touches the frame,
//      so the four frame edges are all real background to build it from.
//
//   2. That estimate must be a COONS PATCH, not the average of the two
//      interpolants. The average does not reproduce the boundary it was built
//      from: at the top-centre pixel it came back 9 levels off the actual value,
//      over tolerance, so the frame seed itself failed the field test and the
//      flood never started along that edge.
//
//   3. The field carries vertical BRUSH STREAKS that a Coons patch cannot
//      express, and they stand up as barriers the flood can't cross — leaving
//      the background full of unfilled stripes. They are constant down a column,
//      so a per-column median offset removes them almost exactly. This is what
//      took background error from ~15 levels down to under 5, which is what
//      finally made a tolerance tight enough to hold the pump.
//
//   4. Two big regions of background are ENCLOSED by the subject (the window
//      under the canopy, the loop of the hose). A border flood can never reach
//      them, and leaving them opaque puts grey patches on the map where it
//      should show through. Hence the second pass. And after both passes, only
//      the largest remaining blob is the pump; the rest is speckle.
import sharp from 'sharp'
import path from 'node:path'

const IN = process.argv[2] || path.resolve('design/fuel-mockup/raw/pump-node.png')
const OUT = process.argv[3] || path.resolve('design/fuel-mockup/pump-node.png')

const BLUR = 1.2      // takes the sensor grain off without eating the outline
const TOL = 10        // background error measures under 5; this is the headroom
const CLEAR_BAND = 60 // rows at the top and bottom that are pure background in every column
// The enclosed-hole test has to be MUCH tighter than the flood tolerance. At
// TOL the pump's own flat silver panels qualify as "field-like" and get cut,
// which hollowed the whole body out on the first run. A real window reads as
// the field to within a couple of levels across thousands of pixels; a panel
// does not.
const HOLE_TOL = 4
const HOLE_MIN = 2500

const { data, info } = await sharp(IN).blur(BLUR).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height
const lum = new Float32Array(W * H)
for (let i = 0; i < W * H; i++) {
  lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
}

// ── Background estimate ────────────────────────────────────────────────────
const top = new Float32Array(W), bot = new Float32Array(W)
const left = new Float32Array(H), right = new Float32Array(H)
for (let x = 0; x < W; x++) { top[x] = lum[x]; bot[x] = lum[(H - 1) * W + x] }
for (let y = 0; y < H; y++) { left[y] = lum[y * W]; right[y] = lum[y * W + W - 1] }

const C00 = top[0], C10 = top[W - 1], C01 = bot[0], C11 = bot[W - 1]
const coons = new Float32Array(W * H)
for (let y = 0; y < H; y++) {
  const fy = y / (H - 1)
  for (let x = 0; x < W; x++) {
    const fx = x / (W - 1)
    coons[y * W + x] =
      (1 - fy) * top[x] + fy * bot[x] + (1 - fx) * left[y] + fx * right[y] -
      ((1 - fx) * (1 - fy) * C00 + fx * (1 - fy) * C10 + (1 - fx) * fy * C01 + fx * fy * C11)
  }
}

// Per-column correction for the brush streaks, measured ONLY in the clear bands
// above and below the subject.
//
// The first version sampled the whole column and kept whatever fell within a
// tolerance of the Coons estimate. In the middle columns most of the column IS
// the pump, so the "trusted" set was mostly pump pixels that happened to land
// near the field, and the offset came out biased by the subject it was supposed
// to be independent of. Those are precisely the columns where the canopy sits,
// and precisely where the flood then leaked straight through it.
const off = new Float32Array(W)
for (let x = 0; x < W; x++) {
  const s = []
  for (let y = 0; y < CLEAR_BAND; y++) s.push(lum[y * W + x] - coons[y * W + x])
  for (let y = H - CLEAR_BAND; y < H; y++) s.push(lum[y * W + x] - coons[y * W + x])
  s.sort((a, b) => a - b)
  off[x] = s[(s.length / 2) | 0]
}
const offS = new Float32Array(W)        // 7-tap smooth, so one bad column can't notch the field
for (let x = 0; x < W; x++) {
  let a = 0, n = 0
  for (let k = -3; k <= 3; k++) { const j = x + k; if (j >= 0 && j < W) { a += off[j]; n++ } }
  offS[x] = a / n
}

const diff = new Float32Array(W * H)
for (let i = 0; i < W * H; i++) diff[i] = Math.abs(lum[i] - (coons[i] + offS[i % W]))

// ── Pass 1: flood inward from the frame ────────────────────────────────────
// Scanline with an explicit stack. Recursion blows the call stack on an image
// this size before it finishes one edge.
const outside = new Uint8Array(W * H)
const st = []
for (let x = 0; x < W; x++) st.push(x, 0, x, H - 1)
for (let y = 0; y < H; y++) st.push(0, y, W - 1, y)
while (st.length) {
  const y = st.pop(), x = st.pop(), i = y * W + x
  if (outside[i] || diff[i] > TOL) continue
  let x0 = x; while (x0 > 0 && !outside[y * W + x0 - 1] && diff[y * W + x0 - 1] <= TOL) x0--
  let x1 = x; while (x1 < W - 1 && !outside[y * W + x1 + 1] && diff[y * W + x1 + 1] <= TOL) x1++
  for (let xi = x0; xi <= x1; xi++) {
    outside[y * W + xi] = 1
    if (y > 0) st.push(xi, y - 1)
    if (y < H - 1) st.push(xi, y + 1)
  }
}

// ── Pass 2: open the mask ──────────────────────────────────────────────────
// What survives the flood is the pump PLUS thin vertical stripes of background
// where a brush streak stood the flood off. An opening — erode, then dilate by
// the same amount — deletes anything narrower than the kernel and leaves
// everything wider untouched. The stripes are a few pixels across and the pump
// is hundreds, so one pass separates them cleanly, which no intensity threshold
// managed to do.
//
// There is NO pass here for the two enclosed windows (under the canopy, inside
// the loop of the hose). Cutting them is impossible on this asset: the window
// and the pump's lower body are connected through pixels that are field-like in
// both, so a flood seeded in the window walks out into the body and hollows the
// pump. Every attempt cost the subject. At the size this sits on the map the
// filled window reads as part of the pump, so it stays.
// NOTE the toColourspace. sharp promotes a 1-channel raw input to 3-channel
// sRGB on the way out, so .raw().toBuffer() hands back INTERLEAVED RGB. Reading
// that as if it were one byte per pixel scrambles the mask into a striped mess
// — which is what silently wrecked the feather for several rounds and looked
// exactly like a matte that had eaten the subject.
function morph(mask, sigma, cut) {
  return sharp(Buffer.from(mask), { raw: { width: W, height: H, channels: 1 } })
    .blur(sigma).toColourspace('b-w').raw().toBuffer()
    .then((b) => { const o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) o[i] = b[i] > cut ? 255 : 0; return o })
}
let solid = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) solid[i] = outside[i] ? 0 : 255
solid = await morph(solid, 4, 190)   // erode
solid = await morph(solid, 4, 60)    // dilate back
function region(start, test) {
  const seen = [], s = [start % W, (start / W) | 0]
  const mark = new Set([start])
  while (s.length) {
    const y = s.pop(), x = s.pop(), i = y * W + x
    seen.push(i)
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const j = ny * W + nx
      if (mark.has(j) || !test(j)) continue
      mark.add(j); s.push(nx, ny)
    }
  }
  return seen
}

// ── Pass 3: keep only the pump ─────────────────────────────────────────────
// Whatever the flood could not reach is either the pump or leftover speckle
// where a brush streak stood the flood off. Taking the LARGEST blob picks the
// speckle — the stripes all connect along the frame into one region bigger than
// the pump, which threw the subject away entirely and kept the background.
//
// So seed from the pixel that is furthest from the field. That is guaranteed to
// be on the pump's dark outline, and the outline rings the whole subject, so the
// body panels come with it however closely they match the field.
let seed = 0
for (let i = 1; i < W * H; i++) if (solid[i] && diff[i] > diff[seed]) seed = i
const best = region(seed, (j) => !!solid[j])
const keep = new Uint8Array(W * H)
for (const i of best) keep[i] = 1

// ── Matte ──────────────────────────────────────────────────────────────────
const alphaRaw = Buffer.alloc(W * H)
for (let i = 0; i < W * H; i++) alphaRaw[i] = keep[i] ? 255 : 0
const alpha = await sharp(alphaRaw, { raw: { width: W, height: H, channels: 1 } })
  .blur(1.4).toColourspace('b-w').raw().toBuffer()

// Composite the SHARP original through the mask — the blurred copy was only
// ever a measuring device.
const src = await sharp(IN).ensureAlpha().raw().toBuffer()
const rgba = Buffer.alloc(W * H * 4)
let minx = W, maxx = -1, miny = H, maxy = -1
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = src[i * 4]; rgba[i * 4 + 1] = src[i * 4 + 1]; rgba[i * 4 + 2] = src[i * 4 + 2]
  rgba[i * 4 + 3] = alpha[i]
  if (alpha[i] > 6) {
    const x = i % W, y = (i / W) | 0
    if (x < minx) minx = x; if (x > maxx) maxx = x
    if (y < miny) miny = y; if (y > maxy) maxy = y
  }
}

// Crop by the alpha bounding box by hand. sharp's own .trim() keys off the
// top-left PIXEL COLOUR, and every transparent pixel here keeps its original
// RGB, so trim sees a thousand different "backgrounds" and barely crops.
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: minx, top: miny, width: maxx - minx + 1, height: maxy - miny + 1 })
  .png({ compressionLevel: 9 })
  .toFile(OUT)

console.log(`${path.basename(OUT)} — ${maxx - minx + 1}x${maxy - miny + 1}` +
  `, ${(100 * best.length / (W * H)).toFixed(1)}% opaque`)
