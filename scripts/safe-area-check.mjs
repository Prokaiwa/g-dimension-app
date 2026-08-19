// Safe-area / walkthrough harness.
//
// WHY THIS IS A FAITHFUL TEST, not a mockup:
// index.html sets viewport-fit=cover. In the Capacitor iOS shell that means the
// WKWebView fills the physical screen, so CSS y=0 IS the top of the display and
// iOS paints the status bar ON TOP of the page. A browser at the same viewport
// with a status bar drawn over it therefore shows exactly what the device shows.
// (In mobile Safari this never bites because the browser chrome sits above the
// page and the inset resolves to 0 -- which is why it has never been reported.)
//
// iPhone 14 Pro portrait: 393x852 CSS px, safe-area-inset-top 59, bottom 34.
// iPhone 13/14 non-Pro:   390x844, top 47, bottom 34. We test the SMALLER inset
// (47) because it is the more common device and still clips.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const EMAIL = process.env.GD_EMAIL
const PASSWORD = process.env.GD_PASSWORD
// Output is disposable: screenshots + report.json. Defaults INTO the ignored
// test-results/ so a plain `npm run check:safe-area` never litters the repo root.
const OUT = process.env.GD_OUT || 'test-results/shots'
const INSET_TOP = 47
const INSET_BOTTOM = 34
const FORCE = process.env.GD_FORCE_INSET === '1'

mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['home', '/home'],
  ['garage', '/garage'],
  ['garage-cars', '/garage/cars'],
  ['garage-snapshot', '/garage/snapshot'],
  ['garage-documents', '/garage/documents'],
  ['garage-contacts', '/garage/contacts'],
  ['garage-reminders', '/garage/reminders'],
  ['tuning', '/tuning'],
  ['tuning-buildsheet', '/tuning/build-sheet'],
  ['tuning-parts', '/tuning/parts-bin'],
  ['maintenance', '/maintenance'],
  ['maintenance-service', '/maintenance/service'],
  ['maintenance-detail', '/maintenance/detail'],
  ['fuel', '/fuel'],
  ['timeline', '/timeline'],
  ['featured', '/featured'],
  ['discover', '/discover'],
  ['profile', '/profile'],
  ['settings', '/settings'],
  ['notifications', '/notifications'],
]

// Draw the iOS status bar + home indicator over the page, exactly where the OS
// would paint them. Pointer-events none so it never blocks a later interaction.
const OVERLAY = (top, bottom) => `
  const old = document.getElementById('__gd_safe_overlay'); if (old) old.remove();
  const d = document.createElement('div');
  d.id = '__gd_safe_overlay';
  d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
  d.innerHTML = \`
    <div style="position:absolute;top:0;left:0;right:0;height:${top}px;
                background:rgba(255,0,80,0.22);
                border-bottom:1px solid rgba(255,0,80,0.9);
                font:600 11px -apple-system,sans-serif;color:#fff;
                display:flex;align-items:center;justify-content:space-between;
                padding:0 26px;box-sizing:border-box">
      <span style="text-shadow:0 1px 2px #000">9:41</span>
      <span style="text-shadow:0 1px 2px #000">STATUS BAR / NOTCH — ${top}px</span>
    </div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:${bottom}px;
                background:rgba(0,180,255,0.18);
                border-top:1px solid rgba(0,180,255,0.9)">
      <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
                  width:140px;height:5px;border-radius:3px;background:#fff;opacity:.85"></div>
    </div>\`;
  document.body.appendChild(d);
`

// Find what the status bar would cover. We only care about things a user needs:
// text, buttons, inputs, images -- not layout wrappers or full-screen backdrops.
const PROBE = (top) => `
(() => {
  const hits = [];
  const seen = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.closest('#__gd_safe_overlay')) return;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) return;
    if (r.top >= ${top}) return;          // starts below the status bar: safe
    if (r.bottom <= 0) return;            // scrolled off
    if (r.height > 400) return;           // page/background wrapper, not content
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') return;
    const tag = el.tagName.toLowerCase();
    const txt = (el.textContent || '').trim().slice(0, 40);
    const interactive = ['button','a','input','textarea','select'].includes(tag);
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const isImg = tag === 'img' || tag === 'svg';
    if (!interactive && !ownText && !isImg) return;
    const key = tag + '|' + txt + '|' + Math.round(r.top) + '|' + Math.round(r.left);
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({
      tag, txt, interactive,
      top: Math.round(r.top), left: Math.round(r.left),
      h: Math.round(r.height),
      covered: Math.round(Math.min(r.bottom, ${top}) - Math.max(r.top, 0)),
    });
  });
  return hits.sort((a,b) => a.top - b.top).slice(0, 12);
})()
`

// Preflight. Both requirements are easy to forget and produce unhelpful crashes
// otherwise (a null fill() on the login form, or a connection refused).
if (!process.env.GD_EMAIL || !process.env.GD_PASSWORD) {
  console.error(
    'Missing credentials.\n\n' +
    '  GD_EMAIL=you@example.com GD_PASSWORD=... npm run check:safe-area\n\n' +
    'Any account with at least one car works; it only navigates and measures.'
  )
  process.exit(1)
}
try {
  const r = await fetch(BASE, { signal: AbortSignal.timeout(4000) })
  if (!r.ok) throw new Error(String(r.status))
} catch {
  console.error(`No dev server at ${BASE}. Start one first:\n\n  npm run dev\n`)
  process.exit(1)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))

// ---- sign in ----
await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
await page.locator('input[type="email"]').fill(EMAIL)
await page.locator('input[type="password"]').fill(PASSWORD)
await page.getByRole('button', { name: 'Sign In' }).click()
await page.waitForURL('**/home', { timeout: 20000 })
await page.waitForTimeout(1500)

// Dismiss the cold-launch START splash (src/components/StartSplash.tsx). It
// renders OVER the real page and only sets sessionStorage.gdim_splash_seen when
// tapped -- so an untapped splash reappears on every full page load and every
// screenshot catches it instead of the page. Tap it for real (that is also the
// gesture that unlocks audio), then belt-and-braces the flag.
try {
  const start = page.getByRole('button', { name: /Start G-Dimension/i })
  if (await start.count()) { await start.click({ timeout: 3000 }); await page.waitForTimeout(700) }
} catch { /* splash may already be gone */ }
await page.evaluate(() => { try { sessionStorage.setItem('gdim_splash_seen', '1') } catch {} })
console.log('signed in, splash dismissed\n')

const report = []

for (const [name, path] of ROUTES) {
  const before = consoleErrors.length
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 })
  } catch {
    // networkidle can hang on pages holding a subscription; fall back
    await page.waitForTimeout(1200)
  }
  await page.waitForTimeout(1400)   // let entry animations settle

  const landed = new URL(page.url()).pathname
  const redirected = landed !== path

  // THE POINT OF ADR-035. env() cannot be overridden from a test, a custom
  // property can -- so with GD_FORCE_INSET=1 we set --safe-top to a real device
  // value and the page lays out exactly as it would on a notched iPhone. An
  // inline property on :root beats the stylesheet rule. Without the variable
  // indirection this assertion is impossible to write, which is precisely how
  // the bug reached 845 commits.
  if (FORCE) {
    await page.evaluate(([t, b]) => {
      document.documentElement.style.setProperty('--safe-top', t + 'px')
      document.documentElement.style.setProperty('--safe-bottom', b + 'px')
    }, [INSET_TOP, INSET_BOTTOM])
    await page.waitForTimeout(350)   // reflow
  }

  const hits = await page.evaluate(PROBE(INSET_TOP))
  await page.evaluate(OVERLAY(INSET_TOP, INSET_BOTTOM))
  await page.screenshot({ path: `${OUT}/${name}.png` })

  const errs = consoleErrors.slice(before)
  report.push({ name, path, landed, redirected, hits, errs })

  const flag = hits.length ? `⚠ ${hits.length} under status bar` : 'clear'
  console.log(`${name.padEnd(20)} ${String(path).padEnd(26)} ${redirected ? '→ ' + landed + ' ' : ''}${flag}${errs.length ? `  [${errs.length} console errors]` : ''}`)
  for (const h of hits.slice(0, 4)) {
    console.log(`   ${h.interactive ? 'TAP ' : '    '}<${h.tag}> top:${h.top} covered:${h.covered}px  "${h.txt}"`)
  }
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(`\nscreenshots + report.json -> ${OUT}`)
await browser.close()
