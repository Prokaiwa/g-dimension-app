// Dynamic sitemap for public build profiles.
//
// The static public/sitemap.xml covers the fixed marketing/auth/legal URLs.
// This function generates a second sitemap listing every public build profile
// (/builds/:username) so search + AI crawlers can discover real user builds —
// the user-generated content that AI answer engines lean on. Referenced from a
// second `Sitemap:` line in robots.txt and served at /sitemap-builds.xml via a
// rewrite in vercel.json.
//
// Only the profile hub URL is listed per public username. Sub-pages
// (buildsheet/timeline/featured) can each be turned private per-section, so
// listing only the always-public hub avoids advertising a private/empty page.
//
// NOTE: /builds/* pages are still client-rendered — this aids DISCOVERY, but the
// full SEO/GEO payoff arrives once those pages are server-rendered/prerendered.

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://uxqoernfrtgclpneirvc.supabase.co'
// Public browser-visible anon key (same one shipped in the client bundle and
// used by api/og.js) — NOT the secret service_role key. Env var preferred; the
// fallback keeps the sitemap working on first deploy with zero config.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4cW9lcm5mcnRnY2xwbmVpcnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNzY3NjEsImV4cCI6MjA5Mjc1Mjc2MX0.JPDzzgf7PqNKpQ-VUJfeA84WqIuQXBl_uNk58Nqc1-E'

const SITE = 'https://gdimension.app'

export default async function handler(req, res) {
  let usernames = []
  try {
    // public_car_profiles only contains cars with is_public = true, so any
    // username present here has at least one public build to show.
    const url =
      `${SUPABASE_URL}/rest/v1/public_car_profiles` +
      `?select=username&order=username.asc&limit=5000`
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    if (r.ok) {
      const rows = await r.json()
      if (Array.isArray(rows)) {
        usernames = [...new Set(rows.map(x => x && x.username).filter(Boolean))]
      }
    }
  } catch {
    usernames = []
  }

  const entries = usernames
    .map(
      u =>
        `  <url><loc>${SITE}/builds/${encodeURIComponent(
          u,
        )}</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    )
    .join('\n')

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    (entries ? entries + '\n' : '') +
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
