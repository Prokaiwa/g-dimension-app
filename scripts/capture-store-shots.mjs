// Capture real app screens at exact App Store pixel dimensions.
//
// Runs the local Vite dev server (port 5199) against the LIVE Supabase project
// and screenshots each screen at 430x932 CSS @3x => 1290x2796, the App Store
// 6.9" size. Output lands in design/store-shots/raw/ for the compositor.
//
// Two container-specific obstacles, both documented in BUILD_NOTES.md
// ("Driving the live app from a container session"):
//
//  1. Chromium cannot reach the network through the sandbox proxy at all.
//     Node's fetch can, with NODE_USE_ENV_PROXY + NODE_EXTRA_CA_CERTS. So we
//     intercept every supabase.co request in Playwright and relay it through
//     Node's fetch. content-encoding/content-length must be stripped because
//     fetch has already decoded the body.
//  2. The cold-launch START splash blocks everything until tapped. Seed the
//     sessionStorage flag it checks before the app boots.
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'http://localhost:5199'
const OUT = path.resolve('design/store-shots/raw')

// App Store 6.9" is 1290x2796. 430x932 CSS at deviceScaleFactor 3 lands exactly.
//
// Capture at exactly that. Two earlier approaches were worse: upscaling the
// art to crop the header also cropped the left/right edges (it ate "YEAR" off
// the info strip), and capturing a taller 430x1050 viewport made the entry
// animations land mid-flight, leaving ghost CHOOSE/DETAILS labels stamped
// under the header. At the native design height the app renders exactly as
// shipped, and the compositor overlays type on the stage instead of cropping.
const VIEWPORT = { width: 430, height: Number(process.env.GDIM_VH || 932) }
const SCALE = 3

// Screens to capture. `auth: true` needs GDIM_EMAIL / GDIM_PASSWORD.
const SCREENS = [
  { name: '01-home',        path: '/home',                          auth: true },
  { name: '02-garage-cars', path: '/garage/cars',                   auth: true },
  { name: '03-buildsheet',  path: '/tuning/build-sheet',            auth: true },
  { name: '04-timeline',    path: '/timeline',                      auth: true },
  { name: '05-parts-bin',   path: '/tuning/parts-bin',              auth: true },
  // /maintenance is only the hub (a mostly empty diagonal with two tiles).
  // The service history LIST is the screen that proves the record exists.
  { name: '06-maintenance', path: '/maintenance',                   auth: true },
  { name: '06b-service',    path: '/maintenance/service',           auth: true },
  { name: '06c-detailing',  path: '/maintenance/detail',            auth: true },
  { name: '07-featured',    path: '/featured',                      auth: true },
  { name: '08-garage',      path: '/garage',                        auth: true },
  { name: '09-tuning',      path: '/tuning',                        auth: true },
  { name: '10-discover',    path: '/discover',                      auth: false },
]

// Public fallbacks, usable with no credentials at all. GDIM_CAR deep-links the
// garage carousel to a specific car so the hero build is deterministic rather
// than whichever car happens to sort first.
const PUBLIC_SCREENS = (u, car) => [
  { name: `pub-garage`,     path: `/builds/${u}/garage${car ? `?car=${car}` : ''}` },
  { name: `pub-buildsheet`, path: `/builds/${u}/buildsheet` },
  { name: `pub-timeline`,   path: `/builds/${u}/timeline` },
  { name: `pub-featured`,   path: `/builds/${u}/featured` },
  { name: `pub-profile`,    path: `/builds/${u}` },
]

// Relay Chromium's Supabase traffic through Node's fetch, which is the only
// thing in this container that can egress.
async function installRelay(ctx) {
  // Supabase for data/photos, Google Fonts for type. Without the font hosts the
  // capture silently falls back to Helvetica and every headline is wrong.
  const RELAYED = [
    '**://*.supabase.co/**',
    '**://fonts.googleapis.com/**',
    '**://fonts.gstatic.com/**',
  ]
  for (const pattern of RELAYED) await ctx.route(pattern, async (route) => {
    const req = route.request()
    try {
      const res = await fetch(req.url(), {
        method: req.method(),
        headers: req.headers(),
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer(),
        redirect: 'follow',
      })
      const body = Buffer.from(await res.arrayBuffer())
      const headers = {}
      res.headers.forEach((v, k) => {
        // fetch already decoded the body; leaving these makes the browser
        // fail to parse the response.
        if (k === 'content-encoding' || k === 'content-length') return
        headers[k] = v
      })
      await route.fulfill({ status: res.status, headers, body })
    } catch (err) {
      await route.abort()
    }
  })
}

async function shoot(page, screen) {
  await page.goto(`${BASE}${screen.path}`, { waitUntil: 'networkidle' })
  // Type must be resolved before the shot or Hanken/Cormorant/Anton fall back
  // to Helvetica and every headline comes out with the wrong metrics.
  await page.evaluate(() => document.fonts.ready)
  // Entry animations (EASING_SETTLE, staggered grid reveals) need to settle,
  // and lazy route chunks + images need to land.
  await page.waitForTimeout(3500)
  const file = path.join(OUT, `${screen.name}.png`)
  await page.screenshot({ path: file })
  console.log(`  captured ${screen.name}.png`)
}

async function main() {
  const email = process.env.GDIM_EMAIL
  const password = process.env.GDIM_PASSWORD
  const publicUser = process.env.GDIM_PUBLIC_USER

  await mkdir(OUT, { recursive: true })

  // The pinned @playwright/test wants a browser build this image doesn't carry
  // (it ships 1194). Point at the bundled binary instead of downloading one;
  // PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set in this environment on purpose.
  const browser = await chromium.launch({
    executablePath: process.env.GDIM_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  })
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
locale: 'en-US',
  })
  await installRelay(ctx)
  // The cold-launch splash blocks every route until tapped. Seed the flag it
  // checks before the app boots.
  //
  // GDIM_CAR also pins the active car, so every authed screen (Build Sheet,
  // Timeline, Maintenance, Featured) reports on the SAME build rather than
  // whatever this account last opened. CLAUDE.md reserves the active-car key
  // to lib/activeCar.ts and the constitution enforces that over src/ — this is
  // external capture tooling, not app code, and it has no module to import
  // from, so it writes the key directly and deliberately.
  const activeCar = process.env.GDIM_CAR
  await ctx.addInitScript((carId) => {
    sessionStorage.setItem('gdim_splash_seen', '1')
    if (carId) localStorage.setItem('gdim_chosen_car_id', carId)
  }, activeCar)

  const page = await ctx.newPage()
  page.on('console', (m) => m.type() === 'error' && console.log('  [console]', m.text().slice(0, 200)))

  let signedIn = false
  if (email && password) {
    console.log('Signing in...')
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    // Select by input type: the fields are a custom ConcretePanelInput with a
    // `label` prop, so there is no placeholder to match on.
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL((u) => !/\/login$/.test(u.pathname), { timeout: 20_000 })
    signedIn = true
    console.log(`  signed in, landed on ${new URL(page.url()).pathname}`)
  } else {
    console.log('No GDIM_EMAIL / GDIM_PASSWORD set, capturing public screens only.')
  }

  const list = signedIn
    ? SCREENS
    : PUBLIC_SCREENS(publicUser || 'dscan007', process.env.GDIM_CAR)

  for (const screen of list) {
    if (screen.auth && !signedIn) continue
    try {
      await shoot(page, screen)
    } catch (err) {
      console.log(`  FAILED ${screen.name}: ${err.message.split('\n')[0]}`)
    }
  }

  await writeFile(
    path.join(OUT, 'MANIFEST.json'),
    JSON.stringify({ viewport: VIEWPORT, scale: SCALE, output: `${VIEWPORT.width * SCALE}x${VIEWPORT.height * SCALE}`, captured: list.map((s) => s.name), at: new Date().toISOString() }, null, 2),
  )

  await browser.close()
  console.log(`\nDone. ${VIEWPORT.width * SCALE}x${VIEWPORT.height * SCALE} PNGs in design/store-shots/raw/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
