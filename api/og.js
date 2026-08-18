// Per-build Open Graph injector + crawlable content for /builds/*.
//
// The app is a client-rendered SPA, so link unfurlers (iMessage, X, Discord,
// Slack, Facebook, WhatsApp) — which don't run JS — only ever see the generic
// default OG tags baked into index.html. This Vercel serverless function sits
// in front of /builds/* (see the rewrite in vercel.json), resolves the build's
// car from the public_car_profiles view, and returns the REAL index.html with
// the default OG/Twitter/title/description tags swapped for that car's.
//
// It returns the full, unmodified-otherwise index.html (scripts + asset links
// intact) with status 200, so a normal browser visit still boots the SPA and
// client-side routing takes over — no user-agent sniffing. Bots read the meta;
// humans get the app. See docs/LINK_PREVIEWS_TASK.md.
//
// It ALSO pre-renders each public room's real content into #root. This matters
// more than the unfurl: Google renders JS only on a deferred second pass, and
// the AI answer engines (GPTBot, PerplexityBot, ClaudeBot, OAI-SearchBot) do
// not run JS at all — so before this, every public build was a literally empty
// <div id="root"> to them, and the ~100 build URLs in the sitemap carried zero
// indexable text. createRoot() replaces #root on mount, so humans still get the
// SPA; the block is a fast-paint fallback that happens to be what crawlers eat.
// The blocks also carry real <a> links between rooms, which is the only
// non-JS crawl path into a build (the SPA's own nav is JS-rendered).
//
// PRIVACY: every block is built from anon-key reads through the same views and
// RLS the public pages use, and selects only public columns. Costs, receipts,
// VIN, plate and purchase price are never selected here. Rooms the owner has
// switched off (show_*_publicly = false) get no block at all.

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://uxqoernfrtgclpneirvc.supabase.co'
// The anon key is already public (shipped in the client bundle — this is the
// browser-visible anon/public key, NOT the secret service_role key). Prefer the
// env var; the hard-coded fallback keeps the function working if it's unset, so
// per-build previews render on first deploy with zero dashboard config.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cW9lcm5mcnRnY2xwbmVpcnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzY3NjEsImV4cCI6MjA5Mjc1Mjc2MX0.JPDzzgf7PqNKpQ-VUJfeA84WqIuQXBl_uNk58Nqc1-E'

const SITE = 'https://gdimension.app'
const DEFAULT_IMAGE = `${SITE}/og-default.png`
const DEFAULT_TITLE = 'G-Dimension — Your car build journal'
const DEFAULT_DESC =
  'Log every mod, service, and milestone — and share a clean public profile of your build.'

// Escape a value for safe inclusion in an HTML attribute (content="...").
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Build the car's display name: nickname if set, else "year make model variant".
function carName(car) {
  if (car.nickname && car.nickname.trim()) return car.nickname.trim()
  const parts = [car.year, car.make, car.model, car.variant].filter(Boolean)
  return parts.join(' ').trim()
}

// Pick the best photo for an unfurl. garage_photo_url is a transparent PNG
// cutout (looks bad on OG), so it's the last resort before the default.
function carImage(car) {
  return (
    car.original_photo_url ||
    car.showcase_photo_url ||
    car.garage_photo_url ||
    DEFAULT_IMAGE
  )
}

// SOLD ghost display name (frozen snapshot): nickname else "year make model variant".
function soldName(g) {
  if (g.snapshot_nickname && g.snapshot_nickname.trim()) return g.snapshot_nickname.trim()
  const parts = [g.snapshot_year, g.snapshot_make, g.snapshot_model, g.snapshot_variant].filter(Boolean)
  return parts.join(' ').trim() || 'A car'
}

// Resolve a sold-car ghost by id from the anon-readable public_sold_cars view.
async function resolveSoldCar(ghostId) {
  if (!ghostId || !SUPABASE_ANON_KEY) return null
  const select =
    'id,seller_username,buyer_username,buyer_display_name,' +
    'snapshot_year,snapshot_make,snapshot_model,snapshot_variant,snapshot_nickname,snapshot_photo_url'
  const url =
    `${SUPABASE_URL}/rest/v1/public_sold_cars` +
    `?id=eq.${encodeURIComponent(ghostId)}` +
    `&select=${encodeURIComponent(select)}` +
    `&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

// Fetch the deployed, BUILT index.html (hashed asset links intact) so the SPA
// still boots for real visitors. /index.html is served by Vercel's filesystem
// handler (it sits before the SPA fallback), so this never loops back here.
async function fetchIndexHtml(host) {
  const res = await fetch(`https://${host}/index.html`, {
    headers: { accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`index.html fetch failed: ${res.status}`)
  return res.text()
}

// Public columns only, shared by BOTH car lookups (by handle, and by id for the
// /c/ permalink) so the two can never drift into selecting different things.
// Everything here is already anon-readable through the public_car_profiles
// view; there is deliberately no VIN, plate, purchase price or cost column.
const CAR_SELECT =
  'id,year,make,model,trim,variant,nickname,username,display_name,' +
  'original_photo_url,showcase_photo_url,garage_photo_url,active_car_id,created_at,' +
  'show_buildsheet_publicly,show_timeline_publicly,show_featured_publicly,' +
  'chassis_code,color,engine_type,engine_origin,forced_induction,transmission,drivetrain,' +
  'horsepower,torque,current_mileage,weight_lbs,usage_type,' +
  'bio,city,country,purchase_story,featured_story,' +
  'power_unit,torque_unit,distance_unit,mileage_unit'

// Resolve username -> the car to feature. Mirrors PublicProfilePage: prefer the
// visitor-selected ?car, then the owner's active car, then the newest public
// car. Returns null for private/missing (caller falls back to generic OG).
async function resolveCar(username, carParam) {
  if (!username || !SUPABASE_ANON_KEY) return null
  const url =
    `${SUPABASE_URL}/rest/v1/public_car_profiles` +
    `?username=eq.${encodeURIComponent(username)}` +
    `&select=${encodeURIComponent(CAR_SELECT)}` +
    `&order=created_at.desc`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  if (!Array.isArray(rows) || rows.length === 0) return null
  const activeId = rows[0].active_car_id
  return (
    (carParam ? rows.find(r => r.id === carParam) : null) ||
    rows.find(r => r.id === activeId) ||
    rows[0] ||
    null
  )
}

// Resolve a car by its own id, for the /c/:carId permalink that printed
// trading-card QR codes carry (ADR-037). Same view, same public columns as
// resolveCar; only the lookup key differs, because a card cannot encode a
// handle that its owner is free to change afterwards.
async function resolveCarById(carId) {
  if (!carId || !SUPABASE_ANON_KEY) return null
  const url =
    `${SUPABASE_URL}/rest/v1/public_car_profiles` +
    `?id=eq.${encodeURIComponent(carId)}` +
    `&select=${encodeURIComponent(CAR_SELECT)}` +
    `&limit=1`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  // A malformed id makes PostgREST reject the uuid cast, which lands here as
  // !ok and falls through to the generic preview. That is the right outcome:
  // a bad card should unfurl as G-Dimension, not as an error.
  if (!res.ok) return null
  const rows = await res.json()
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

// Self/consolidated canonical for a /builds/* path. The room landing pages
// (hub, garage, buildsheet, timeline, featured) point at THEMSELVES so each is
// independently indexable; the thin per-record detail pages consolidate into
// their room (mod detail + DIY → the build sheet, timeline entry → timeline) so
// they don't compete with it in search. Query params (incl. ?car) are dropped
// so a car's room has ONE canonical URL, matching the sitemap.
function roomCanonical(username, room) {
  const bare = `${SITE}/builds/${encodeURIComponent(username)}`
  if (!room) return bare
  if (room === 'garage' || room === 'buildsheet' || room === 'timeline' || room === 'featured') {
    return `${bare}/${room}`
  }
  if (room === 'mods') return `${bare}/buildsheet` // mod detail + /diy live under the build sheet
  return bare
}

// Fetch a car's installed mods for the crawlable build-sheet block. Anon key +
// RLS (jobs_public_read) return rows ONLY for a public build sheet, and we
// select just the public columns — brand / title / category, NEVER costs.
async function resolveBuildSheetMods(carId) {
  if (!carId || !SUPABASE_ANON_KEY) return []
  const url =
    `${SUPABASE_URL}/rest/v1/jobs` +
    `?car_id=eq.${encodeURIComponent(carId)}` +
    `&status=eq.installed` +
    `&select=${encodeURIComponent('title,brand,category')}` +
    `&order=category.asc&limit=500`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return []
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// "Brand Title" for one mod (brand optional). No costs, ever.
function modLabel(m) {
  const brand = m.brand && m.brand.trim() ? m.brand.trim() + ' ' : ''
  return (brand + (m.title || 'Mod')).trim()
}

// Fetch a car's public timeline entries. Anon key + RLS return rows only for a
// public build; the Timeline room is additionally gated on show_timeline_publicly
// by the caller. Oldest-first, matching PublicTimelinePage.
async function resolveTimeline(carId) {
  if (!carId || !SUPABASE_ANON_KEY) return []
  const url =
    `${SUPABASE_URL}/rest/v1/timeline_entries` +
    `?car_id=eq.${encodeURIComponent(carId)}` +
    `&select=${encodeURIComponent('entry_type,is_origin,title,journal_entry,display_date')}` +
    `&order=display_date.asc&limit=200`
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  if (!res.ok) return []
  const rows = await res.json()
  return Array.isArray(rows) ? rows : []
}

// --- Units -----------------------------------------------------------------
// Values are stored in base units (miles, hp, lb-ft) and converted at display
// time only — same contract as src/lib/unitConversion.ts, re-stated here because
// api/ is plain JS outside the Vite bundle and can't import from src/. If those
// factors ever change, change them in both places.
function convPower(hp, unit) {
  if (unit === 'ps') return { n: hp / 0.9863, label: 'PS' }
  if (unit === 'kw') return { n: hp * 0.7457, label: 'kW' }
  return { n: hp, label: 'hp' }
}
function convTorque(lbft, unit) {
  if (unit === 'nm') return { n: lbft * 1.35582, label: 'Nm' }
  return { n: lbft, label: 'lb-ft' }
}
function convDistance(mi, unit) {
  if (unit === 'km') return { n: mi * 1.609344, label: 'km' }
  return { n: mi, label: 'mi' }
}

// "2026-01-12" -> "January 12, 2026". Parsed by hand rather than through Date,
// which reads a bare YYYY-MM-DD as UTC midnight and can render the day before
// in a western timezone. Falls back to the raw string if it isn't a plain date.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
function longDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  if (!m) return String(s || '')
  const name = MONTHS[Number(m[2]) - 1]
  if (!name) return String(s)
  return `${name} ${Number(m[3])}, ${m[1]}`
}

// --- Crawlable page blocks -------------------------------------------------
// Two palettes so the pre-paint block matches the room React is about to mount:
// every public room is dark except the parchment Timeline.
const DARK = { bg: '#050507', fg: '#e8eaf0', muted: '#9aa0ad' }
const PARCHMENT = { bg: '#f5f2ee', fg: '#1a1814', muted: '#8a8278' }

function shell(inner, theme) {
  const t = theme || DARK
  return (
    `<main style="max-width:720px;margin:0 auto;padding:24px 20px;` +
    `font-family:system-ui,sans-serif;background:${t.bg};color:${t.fg};min-height:100vh">` +
    inner +
    `</main>`
  )
}

// Real <a> links to the car's other public rooms. The SPA's own navigation is
// JS-rendered, so without these a non-JS crawler that lands on one room has no
// path to the rest of the build.
function roomLinks(username, car, current) {
  const base = `/builds/${encodeURIComponent(username)}`
  const rooms = [
    ['', 'Build profile'],
    ['garage', 'Car and specs'],
    ['buildsheet', 'Build sheet', car.show_buildsheet_publicly !== false],
    ['timeline', 'Build timeline', car.show_timeline_publicly !== false],
    ['featured', 'Featured', car.show_featured_publicly !== false],
  ]
  const items = rooms
    .filter(r => (r.length < 3 || r[2]) && r[0] !== current)
    .map(r => `<li><a href="${esc(r[0] ? `${base}/${r[0]}` : base)}">${esc(r[1])}</a></li>`)
    .join('')
  return items ? `<nav><ul>${items}</ul></nav>` : ''
}

// Spec rows shared by the hub and the garage room. Public identity + performance
// only — never VIN, plate, or purchase price.
function specList(car) {
  const rows = []
  // "none" / "n/a" are real stored values (e.g. forced_induction on an NA car).
  // They're meaningful in the app's spec sheet next to a label, but as a bare
  // crawlable row they read as missing data, so they're dropped here.
  const EMPTY = new Set(['none', 'n/a', 'na', 'unknown', '-'])
  const add = (k, v) => {
    if (v === null || v === undefined || v === '') return
    if (typeof v === 'string' && EMPTY.has(v.trim().toLowerCase())) return
    rows.push([k, v])
  }
  add('Year', car.year)
  add('Make', car.make)
  add('Model', car.model)
  add('Trim', car.variant || car.trim)
  add('Chassis code', car.chassis_code)
  add('Color', car.color)
  add('Engine', car.engine_type)
  add('Engine origin', car.engine_origin)
  add('Forced induction', car.forced_induction)
  add('Transmission', car.transmission)
  add('Drivetrain', car.drivetrain)
  if (car.horsepower) {
    const p = convPower(Number(car.horsepower), car.power_unit)
    add('Power', `${Math.round(p.n)} ${p.label}`)
  }
  if (car.torque) {
    const q = convTorque(Number(car.torque), car.torque_unit)
    add('Torque', `${Math.round(q.n)} ${q.label}`)
  }
  if (car.current_mileage) {
    const d = convDistance(Number(car.current_mileage), car.distance_unit || car.mileage_unit)
    add('Mileage', `${Math.round(d.n).toLocaleString('en-US')} ${d.label}`)
  }
  if (car.weight_lbs) add('Weight', `${Number(car.weight_lbs).toLocaleString('en-US')} lb`)
  add('Use', car.usage_type)
  if (!rows.length) return ''
  return `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
}

// The profile hub: what this car is, who owns it, and links into every room.
function hubBlock(name, owner, car, username) {
  const where = [car.city, car.country].filter(Boolean).join(', ')
  return shell(
    `<h1>${esc(name)}</h1>` +
    `<p>A car build documented by ${esc(owner)} on G-Dimension${where ? `, ${esc(where)}` : ''}. ` +
    `Modifications, service history, parts and photos, in the order they happened.</p>` +
    (car.bio ? `<p>${esc(car.bio)}</p>` : '') +
    (car.purchase_story ? `<p>${esc(car.purchase_story)}</p>` : '') +
    specList(car) +
    roomLinks(username, car, ''),
    DARK,
  )
}

// The garage room: the car's identity and spec sheet.
function garageBlock(name, owner, car, username) {
  return shell(
    `<h1>${esc(name)} Specs</h1>` +
    `<p>Specifications for ${esc(name)}, a build by ${esc(owner)} on G-Dimension.</p>` +
    (specList(car) || `<p>No specs logged yet.</p>`) +
    roomLinks(username, car, 'garage'),
    DARK,
  )
}

// The build-sheet room: every installed mod by name. This is what makes a build
// findable on its parts ("Tein coilovers", "GReddy intercooler") and not just
// on the car's name.
function buildSheetBlock(name, owner, car, username, mods) {
  const items = mods
    .map(m => {
      const cat = m.category ? ` <span>(${esc(m.category)})</span>` : ''
      return `<li>${esc(modLabel(m))}${cat}</li>`
    })
    .join('')
  return shell(
    `<h1>${esc(name)} Build Sheet</h1>` +
    `<p>Modifications on ${esc(name)}, a build by ${esc(owner)} on G-Dimension.</p>` +
    (items ? `<ul>${items}</ul>` : `<p>No mods logged yet.</p>`) +
    roomLinks(username, car, 'buildsheet'),
    DARK,
  )
}

// The timeline room: the build's story in order. Entries with no text of their
// own (auto-synced session envelopes) are skipped rather than emitted as bare
// dates — a list of empty <li> is noise to a crawler and to a reader.
function timelineBlock(name, owner, car, username, entries) {
  const items = entries
    .map(e => {
      const heading = e.title && e.title.trim() ? e.title.trim() : e.is_origin ? 'The beginning' : ''
      const body = e.journal_entry && e.journal_entry.trim() ? e.journal_entry.trim() : ''
      if (!heading && !body) return ''
      const when = e.display_date
        ? `<p><time datetime="${esc(e.display_date)}">${esc(longDate(e.display_date))}</time></p>`
        : ''
      return (
        `<article>` +
        (heading ? `<h2>${esc(heading)}</h2>` : '') +
        when +
        (body ? `<p>${esc(body)}</p>` : '') +
        `</article>`
      )
    })
    .filter(Boolean)
    .join('')
  return shell(
    `<h1>${esc(name)} Build Timeline</h1>` +
    `<p>The build history of ${esc(name)} by ${esc(owner)}, in the order it happened.</p>` +
    (items || `<p>No timeline entries yet.</p>`) +
    roomLinks(username, car, 'timeline'),
    PARCHMENT,
  )
}

// The Featured room: the owner's written feature story about the car.
function featuredBlock(name, owner, car, username) {
  const story = car.featured_story && car.featured_story.trim() ? car.featured_story.trim() : ''
  return shell(
    `<h1>${esc(name)}</h1>` +
    `<p>A featured build by ${esc(owner)} on G-Dimension.</p>` +
    (story ? `<p>${esc(story)}</p>` : '') +
    roomLinks(username, car, 'featured'),
    DARK,
  )
}

// Schema.org for the build page. A Vehicle nested in the WebPage it is the
// subject of, authored by the owner — the shape answer engines read to state
// "this page is about a specific 1999 Nissan Skyline owned by @handle".
function carJsonLd(name, owner, car, canonical, image, description) {
  const vehicle = {
    '@type': 'Vehicle',
    name,
    description,
    url: canonical,
    image,
  }
  if (car.year) vehicle.vehicleModelDate = String(car.year)
  if (car.make) vehicle.manufacturer = { '@type': 'Organization', name: car.make }
  if (car.model) vehicle.model = car.model
  if (car.variant || car.trim) vehicle.vehicleConfiguration = car.variant || car.trim
  if (car.color) vehicle.color = car.color
  if (car.transmission) vehicle.vehicleTransmission = car.transmission
  if (car.drivetrain) vehicle.driveWheelConfiguration = car.drivetrain
  if (car.engine_type) vehicle.vehicleEngine = { '@type': 'EngineSpecification', name: car.engine_type }
  if (car.current_mileage) {
    const d = convDistance(Number(car.current_mileage), car.distance_unit || car.mileage_unit)
    vehicle.mileageFromOdometer = {
      '@type': 'QuantitativeValue',
      value: Math.round(d.n),
      unitCode: d.label === 'km' ? 'KMT' : 'SMI',
    }
  }
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: canonical,
    name,
    description,
    isPartOf: { '@type': 'WebSite', name: 'G-Dimension', url: `${SITE}/` },
    author: { '@type': 'Person', name: owner },
    mainEntity: vehicle,
  }
  // </script> can't appear inside a JSON-LD block; nothing here should contain
  // it, but user-authored strings flow in, so close the hole anyway.
  return `<script type="application/ld+json">${JSON.stringify(doc).replace(/</g, '\\u003c')}</script>`
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'gdimension.app'

  // The rewrite passes the path after /builds/ as ?p=... and preserves the
  // original query (so ?car= survives). p="john", "john/garage", "john/mods/123".
  const parsed = new URL(req.url, `https://${host}`)
  const p = parsed.searchParams.get('p') || ''
  const segs = p.split('/')
  const username = decodeURIComponent(segs[0] || '')
  const carParam = parsed.searchParams.get('car')
  // The room segment: '', 'garage', 'buildsheet', 'timeline', 'featured',
  // 'mods', 'sold'. Drives the canonical and the build-sheet content injection.
  const room = decodeURIComponent(segs[1] || '')
  // /builds/:username/sold/:ghostId → a sold-car unfurl.
  const soldId = room === 'sold' ? decodeURIComponent(segs[2] || '') : null
  // /c/:carId → the printed-card permalink (ADR-037). Rewritten here as ?carid
  // so a scanned or pasted card link unfurls with that car's photo instead of
  // the generic default.
  const carIdParam = parsed.searchParams.get('carid')
  // Crawlable HTML injected into #root; null keeps #root empty (private /
  // missing builds, and the thin per-record detail routes).
  let rootBlock = null
  // Per-build schema.org, added alongside the site-wide SoftwareApplication
  // block rather than replacing it. Only emitted when there is real content.
  let jsonLd = null

  let html
  try {
    html = await fetchIndexHtml(host)
  } catch {
    // Can't get the shell — let the SPA fallback handle it.
    res.statusCode = 302
    res.setHeader('location', '/index.html')
    res.end()
    return
  }

  // Build the OG values (generic default for private/missing — no leak).
  let title = DEFAULT_TITLE
  let description = DEFAULT_DESC
  let image = DEFAULT_IMAGE
  let canonical = `${SITE}/builds/${username ? encodeURIComponent(username) : ''}`

  let sold = null
  if (soldId) {
    try { sold = await resolveSoldCar(soldId) } catch { sold = null }
  }

  // The /c/ permalink. Handled before the handle-based lookup because it has no
  // handle to look up: the whole point of the route is that the URL survives a
  // rename. Deliberately NO rootBlock and NO JSON-LD here: this route redirects
  // client-side to /builds/*, and injecting indexable content into a page that
  // immediately bounces reads as cloaking. The canonical points at the garage
  // room instead, so search consolidates there and /c/ never competes with it.
  let permalinkCar = null
  if (carIdParam) {
    try { permalinkCar = await resolveCarById(carIdParam) } catch { permalinkCar = null }
  }

  if (carIdParam) {
    if (permalinkCar) {
      const name = carName(permalinkCar)
      const owner = permalinkCar.display_name || `@${permalinkCar.username}`
      title = `${name} · G-Dimension`
      description = `${name}, a build by ${owner} on G-Dimension.`
      image = carImage(permalinkCar)
      canonical = roomCanonical(permalinkCar.username, 'garage')
    } else {
      // Private, deleted, or a mistyped id. Generic preview, no leak, and a
      // canonical that does not pretend a build page exists.
      canonical = `${SITE}/`
    }
  } else if (sold) {
    const name = soldName(sold)
    title = `${name} — Sold · G-Dimension`
    description = sold.buyer_username
      ? `${name} was sold to @${sold.buyer_username} on G-Dimension.`
      : `${name} was sold on G-Dimension.`
    image = sold.snapshot_photo_url || DEFAULT_IMAGE
    canonical = `${SITE}/builds/${encodeURIComponent(sold.seller_username || username)}/sold/${encodeURIComponent(sold.id)}`
  } else {
    let car = null
    try {
      car = await resolveCar(username, carParam)
    } catch {
      car = null
    }

    if (car) {
      const name = carName(car)
      const owner = car.display_name || `@${car.username}`
      title = `${name} · G-Dimension`
      description = `${name} — a build by ${owner} on G-Dimension.`
      image = carImage(car)

      // All sub-pages — including Featured — unfurl with the car's own photo
      // (carImage above). The Featured magazine-cover render (api/og-cover.ts) was
      // deliberately dropped: a straight photo of the owner's car reads more
      // clearly in a link preview. og-cover.ts is now unused.

      // Per-room title/description/content. Each room is indexable as itself
      // (see roomCanonical) so each needs its own text; a shared one would make
      // five near-duplicate pages competing for the same query. Rooms the owner
      // has switched off fall through to the generic car title with no block.
      if (room === '') {
        rootBlock = hubBlock(name, owner, car, username)
        const bits = [car.year, car.make, car.model, car.variant].filter(Boolean).join(' ')
        description =
          `${bits || name} build by ${owner}: modifications, service history, parts and photos, ` +
          `documented in order on G-Dimension.`
      } else if (room === 'garage') {
        rootBlock = garageBlock(name, owner, car, username)
        title = `${name} Specs · G-Dimension`
        description = `Specs for ${name}, a build by ${owner} on G-Dimension.`
      } else if (room === 'buildsheet' && car.show_buildsheet_publicly !== false) {
        // The mod list makes the page findable on its own part names
        // (e.g. "Tein coilovers"), not just on the car name.
        let mods = []
        try { mods = await resolveBuildSheetMods(car.id) } catch { mods = [] }
        rootBlock = buildSheetBlock(name, owner, car, username, mods)
        title = `${name} Build Sheet · G-Dimension`
        const labels = mods.map(modLabel).filter(Boolean)
        description = labels.length
          ? `${name} mods: ${labels.join(', ')}.`
          : `The build sheet for ${name} on G-Dimension.`
      } else if (room === 'timeline' && car.show_timeline_publicly !== false) {
        let entries = []
        try { entries = await resolveTimeline(car.id) } catch { entries = [] }
        rootBlock = timelineBlock(name, owner, car, username, entries)
        title = `${name} Build Timeline · G-Dimension`
        description = `The build history of ${name} by ${owner}, in the order it happened.`
      } else if (room === 'featured' && car.show_featured_publicly !== false) {
        rootBlock = featuredBlock(name, owner, car, username)
        title = `${name} · Featured on G-Dimension`
        const story = car.featured_story && car.featured_story.trim()
        description = story || `A featured build by ${owner} on G-Dimension.`
      }

      if (description.length > 160) description = description.slice(0, 157) + '…'
      if (rootBlock) {
        jsonLd = carJsonLd(name, owner, car, roomCanonical(username, room), image, description)
      }
    }

    // Self/consolidated canonical per room (drops ?car). Overrides the old
    // "everything → hub" behaviour so each room page is indexable as itself.
    canonical = roomCanonical(username, room)
  }

  const t = esc(title)
  const d = esc(description)
  const img = esc(image)
  const url = esc(canonical)

  // Replace the default tags in place (don't duplicate, or the unfurler may
  // pick the wrong one). Each regex targets the exact default line.
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(
      /<meta name="description"[^>]*>/,
      `<meta name="description" content="${d}" />`,
    )
    .replace(
      /<link rel="canonical"[^>]*>/,
      `<link rel="canonical" href="${url}" />`,
    )
    .replace(
      /<meta property="og:title"[^>]*>/,
      `<meta property="og:title" content="${t}" />`,
    )
    .replace(
      /<meta property="og:description"[^>]*>/,
      `<meta property="og:description" content="${d}" />`,
    )
    .replace(
      /<meta property="og:url"[^>]*>/,
      `<meta property="og:url" content="${url}" />`,
    )
    .replace(
      /<meta property="og:image"[^>]*>/,
      `<meta property="og:image" content="${img}" />`,
    )
    .replace(
      /<meta name="twitter:title"[^>]*>/,
      `<meta name="twitter:title" content="${t}" />`,
    )
    .replace(
      /<meta name="twitter:description"[^>]*>/,
      `<meta name="twitter:description" content="${d}" />`,
    )
    .replace(
      /<meta name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" content="${img}" />`,
    )

  // Inject the crawlable room content into the (otherwise empty) #root.
  // createRoot() replaces these children on mount, so humans still get the SPA.
  if (rootBlock) {
    html = html.replace('<div id="root"></div>', `<div id="root">${rootBlock}</div>`)
  }

  // Per-build structured data, appended just before </head>. JSON-LD is a data
  // block, not an executable script, so it needs no CSP script-src hash.
  if (jsonLd) {
    html = html.replace('</head>', `${jsonLd}\n  </head>`)
  }

  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  // Short edge cache so crawlers re-fetch reasonably fresh data without
  // hammering Supabase; humans get the same shell.
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
  res.end(html)
}
