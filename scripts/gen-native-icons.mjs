// One-off generator for native app icons + splash screens, run manually (not
// part of the build). Exists because the standard tool (@capacitor/assets)
// depends on `sharp`, whose native-binary postinstall is blocked in this
// sandbox's network policy — this reimplements just what's needed with jimp
// (pure JS, no native deps).
//
// Source: public/icon-512.png — already the correct composition (the G badge
// on solid #050507 black, same look as the PWA "Add to Home Screen" icon the
// existing icon-192/512/apple-touch-icon assets already nailed). No new art,
// just resizing/compositing that source to what each native platform needs.
//
// Run: node scripts/gen-native-icons.mjs
import { Jimp } from 'jimp'

const BLACK = 0x050507ff // COLOR_CAVITY_BG, fully opaque
const SRC = 'public/icon-512.png'

async function main() {
  const src = await Jimp.read(SRC)

  // ── iOS App Store icon — single "universal" 1024x1024, MUST be fully
  // opaque (Apple's App Store Connect validation rejects an icon that carries
  // an alpha channel at all, even if every pixel is 100% opaque — compositing
  // onto black alone isn't enough, colorType:2 forces the PNG itself to be
  // encoded without one). ──
  {
    const canvas = new Jimp({ width: 1024, height: 1024, color: BLACK })
    canvas.composite(src.clone().resize({ w: 1024, h: 1024 }), 0, 0)
    await canvas.write('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', { colorType: 2 })
    console.log('iOS AppIcon-512@2x.png (1024x1024, no alpha) written')
  }

  // ── Android launcher icons — legacy square/round (pre-adaptive-icon
  // launchers) at each density, using the source directly (it already has a
  // black margin baked in, matching the look on iOS). ──
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
  for (const [density, size] of Object.entries(legacy)) {
    const resized = src.clone().resize({ w: size, h: size })
    await resized.write(`android/app/src/main/res/mipmap-${density}/ic_launcher.png`)
    await resized.write(`android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`)
  }
  console.log('Android legacy ic_launcher(.round).png written for all 5 densities')

  // ── Android adaptive icon foreground layer (108dp base, scaled per
  // density). Simplification: the source's built-in black margin around the
  // badge stands in for a true safe-zone-padded transparent foreground, so an
  // aggressive OEM mask crop only trims plain black, never the badge itself —
  // correct-looking without needing an alpha-safe-zone-precise re-composite.
  // ic_launcher_background.xml below sets the background color to match, so
  // any sliver the mask reveals around the foreground is the same black. ──
  const adaptiveFg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
  for (const [density, size] of Object.entries(adaptiveFg)) {
    await src.clone().resize({ w: size, h: size })
      .write(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`)
  }
  console.log('Android adaptive ic_launcher_foreground.png written for all 5 densities')

  // ── Splash screens — solid black canvas, badge centered at ~32% of the
  // shorter dimension. Only shown briefly during native boot before the
  // app's own React StartSplash takes over, so this just needs to not clash
  // (matches RouteFallback's "just the dark canvas" trick elsewhere). ──
  const splashTargets = [
    ['android/app/src/main/res/drawable/splash.png', 480, 320],
    ['android/app/src/main/res/drawable-land-mdpi/splash.png', 480, 320],
    ['android/app/src/main/res/drawable-land-hdpi/splash.png', 800, 480],
    ['android/app/src/main/res/drawable-land-xhdpi/splash.png', 1280, 720],
    ['android/app/src/main/res/drawable-land-xxhdpi/splash.png', 1600, 960],
    ['android/app/src/main/res/drawable-land-xxxhdpi/splash.png', 1920, 1280],
    ['android/app/src/main/res/drawable-port-mdpi/splash.png', 320, 480],
    ['android/app/src/main/res/drawable-port-hdpi/splash.png', 480, 800],
    ['android/app/src/main/res/drawable-port-xhdpi/splash.png', 720, 1280],
    ['android/app/src/main/res/drawable-port-xxhdpi/splash.png', 960, 1600],
    ['android/app/src/main/res/drawable-port-xxxhdpi/splash.png', 1280, 1920],
    ['ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png', 2732, 2732],
    ['ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png', 2732, 2732],
    ['ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png', 2732, 2732],
  ]
  for (const [path, w, h] of splashTargets) {
    const canvas = new Jimp({ width: w, height: h, color: BLACK })
    const badgeSize = Math.round(Math.min(w, h) * 0.32)
    const badge = src.clone().resize({ w: badgeSize, h: badgeSize })
    canvas.composite(badge, Math.round((w - badgeSize) / 2), Math.round((h - badgeSize) / 2))
    await canvas.write(path)
  }
  console.log('Splash screens written (11 Android + 3 iOS)')
}

main().catch(err => { console.error(err); process.exit(1) })
