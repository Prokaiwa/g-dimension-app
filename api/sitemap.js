// Dynamic sitemap — the single source of truth served at /sitemap.xml
// (see the rewrite in vercel.json). Replaces the old hardcoded
// public/sitemap.xml and the separate sitemap-builds function: this one file
// emits the fixed marketing/legal pages AND every public build profile so
// search + AI crawlers can discover real user builds.
//
// Per public user it lists the crawlable "rooms":
//   /builds/:username            — the profile hub (always public here: the
//                                  public_car_profiles view only returns cars
//                                  with is_public = true)
//   /builds/:username/garage     — identity/specs (always public when the hub is)
//   /builds/:username/buildsheet — only when show_buildsheet_publicly
//   /builds/:username/timeline   — only when show_timeline_publicly
//   /builds/:username/featured   — only when show_featured_publicly
//
// A username can own several cars; the public profile lands on the owner's
// active car (else the newest public one), so the per-section flags are read
// from that same landing car. Per-record detail pages (mods/entries) and SOLD
// ghost keepsakes are deliberately NOT listed.
//
// No <lastmod>: the only anon-readable timestamp on the view is created_at,
// which never changes and would falsely tell crawlers these pages never update.
// Exposing a real updated_at to anon is a future migration; until then we omit
// the element rather than invent a misleading one.
//
// NOTE: /builds/* pages are still client-rendered — this aids DISCOVERY; the
// full SEO payoff arrives once those pages are server-rendered/prerendered.

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://uxqoernfrtgclpneirvc.supabase.co'
// Public browser-visible anon key (the same key shipped in the client bundle
// and used by api/og.js) — NOT the secret service_role key. RLS + the
// public_car_profiles view do the filtering. Env var preferred; the fallback
// keeps the sitemap working on first deploy with zero config.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cW9lcm5mcnRnY2xwbmVpcnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzY3NjEsImV4cCI6MjA5Mjc1Mjc2MX0.JPDzzgf7PqNKpQ-VUJfeA84WqIuQXBl_uNk58Nqc1-E'

const SITE = 'https://gdimension.app'

// Fixed pages that always exist. /login and /signup are intentionally excluded
// (thin auth screens, no crawl value).
const STATIC_PATHS = ['/', '/terms', '/privacy']

// XML-escape a loc value. Usernames are URL-encoded first (encodeURIComponent),
// which already removes < > & " ', so this is belt-and-suspenders.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function urlTag(path) {
  return `  <url><loc>${esc(SITE + path)}</loc></url>`
}

export default async function handler(req, res) {
  const locs = STATIC_PATHS.map(urlTag)

  try {
    // public_car_profiles only contains cars with is_public = true and
    // deleted_at IS NULL, so every row here is a genuinely public build. Order
    // newest-first so the first row seen per username is the newest car (the
    // profile's fallback landing car when there's no active car).
    const select =
      'username,id,active_car_id,' +
      'show_buildsheet_publicly,show_timeline_publicly,show_featured_publicly'
    const url =
      `${SUPABASE_URL}/rest/v1/public_car_profiles` +
      `?select=${select}&order=created_at.desc&limit=5000`
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })

    if (r.ok) {
      const rows = await r.json()
      if (Array.isArray(rows)) {
        // Group by username → { newest, byId } so we can resolve the landing car.
        const byUser = new Map()
        for (const row of rows) {
          const uname = row && row.username
          if (!uname) continue
          let g = byUser.get(uname)
          if (!g) {
            g = { newest: row, byId: new Map() }
            byUser.set(uname, g)
          }
          if (row.id) g.byId.set(row.id, row)
        }

        // Emit rooms for each user based on their landing car's section flags.
        const names = [...byUser.keys()].sort()
        for (const uname of names) {
          const g = byUser.get(uname)
          const landing = g.byId.get(g.newest.active_car_id) || g.newest
          const base = `/builds/${encodeURIComponent(uname)}`
          locs.push(urlTag(base))
          locs.push(urlTag(`${base}/garage`))
          // Flags default true (columns predate a car? still true); only a hard
          // false hides the room.
          if (landing.show_buildsheet_publicly !== false) locs.push(urlTag(`${base}/buildsheet`))
          if (landing.show_timeline_publicly !== false) locs.push(urlTag(`${base}/timeline`))
          if (landing.show_featured_publicly !== false) locs.push(urlTag(`${base}/featured`))
        }
      }
    }
  } catch {
    // Fall through with just the static pages — a valid sitemap beats a 500.
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.join('\n') + '\n' +
    `</urlset>\n`

  res.statusCode = 200
  res.setHeader('content-type', 'application/xml; charset=utf-8')
  // Cache at the edge for an hour; new public builds show up within that window.
  res.setHeader(
    'cache-control',
    'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
  )
  res.end(xml)
}
