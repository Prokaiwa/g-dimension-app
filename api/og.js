// Per-build Open Graph injector.
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

// Resolve username -> the car to feature. Mirrors PublicProfilePage: prefer the
// visitor-selected ?car, then the owner's active car, then the newest public
// car. Returns null for private/missing (caller falls back to generic OG).
async function resolveCar(username, carParam) {
  if (!username || !SUPABASE_ANON_KEY) return null
  const select =
    'id,year,make,model,variant,nickname,username,display_name,' +
    'original_photo_url,showcase_photo_url,garage_photo_url,active_car_id,created_at,' +
    'show_buildsheet_publicly'
  const url =
    `${SUPABASE_URL}/rest/v1/public_car_profiles` +
    `?username=eq.${encodeURIComponent(username)}` +
    `&select=${encodeURIComponent(select)}` +
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

// The crawlable content injected into #root for the build-sheet page. React
// (createRoot) replaces #root on mount, so this is a fast-paint fallback that
// ALSO gives non-JS crawlers (Google's first pass, AI answer engines) the real
// mod list. Dark background matches the app so the hand-off is invisible.
function buildSheetBlock(name, owner, mods) {
  const items = mods
    .map(m => {
      const cat = m.category ? ` <span>(${esc(m.category)})</span>` : ''
      return `<li>${esc(modLabel(m))}${cat}</li>`
    })
    .join('')
  return (
    `<main style="max-width:720px;margin:0 auto;padding:24px 20px;` +
    `font-family:system-ui,sans-serif;background:#050507;color:#e8eaf0;min-height:100vh">` +
    `<h1>${esc(name)} Build Sheet</h1>` +
    `<p>Modifications on ${esc(name)}, a build by ${esc(owner)} on G-Dimension.</p>` +
    (items ? `<ul>${items}</ul>` : `<p>No mods logged yet.</p>`) +
    `</main>`
  )
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
  // Crawlable HTML injected into #root (build sheet only); null keeps #root empty.
  let rootBlock = null

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

  if (sold) {
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

      // Build sheet: inject the real mod list so the page is indexable on its
      // own part names (e.g. "Revel Coilovers"), not just the car name — and so
      // it ranks/lands as itself rather than folding into the profile hub.
      // Gated on show_buildsheet_publicly so a hidden build sheet stays generic.
      if (room === 'buildsheet' && car.show_buildsheet_publicly !== false) {
        let mods = []
        try { mods = await resolveBuildSheetMods(car.id) } catch { mods = [] }
        rootBlock = buildSheetBlock(name, owner, mods)
        title = `${name} Build Sheet · G-Dimension`
        const labels = mods.map(modLabel).filter(Boolean)
        let desc = labels.length
          ? `${name} mods: ${labels.join(', ')}.`
          : `The build sheet for ${name} on G-Dimension.`
        if (desc.length > 160) desc = desc.slice(0, 157) + '…'
        description = desc
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

  // Inject the crawlable build-sheet content into the (otherwise empty) #root.
  // createRoot() replaces these children on mount, so humans still get the SPA.
  if (rootBlock) {
    html = html.replace('<div id="root"></div>', `<div id="root">${rootBlock}</div>`)
  }

  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  // Short edge cache so crawlers re-fetch reasonably fresh data without
  // hammering Supabase; humans get the same shell.
  res.setHeader('cache-control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600')
  res.end(html)
}
