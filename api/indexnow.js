// IndexNow submission endpoint.
//
// IndexNow is a push protocol: instead of waiting for a crawler to come back
// and notice a change, you tell the engine "these URLs changed" and it queues
// them. Bing, Yandex, Seznam and Naver consume it; submitting to any one
// participant shares with all of them. Google does NOT participate, so this is
// purely a Bing-side lever — which matters more than it sounds, because
// ChatGPT's browsing and Copilot both read Bing's index.
//
// Ownership is proved by hosting the key as a plain-text file at the site root
// (public/<key>.txt, whose entire contents are the key). That file is PUBLIC by
// design — the key is not a secret and there is nothing to leak. It only says
// "whoever controls this domain authorized these submissions", which is exactly
// the point.
//
// Usage:
//   GET /api/indexnow                 → submit every URL in /sitemap.xml
//   GET /api/indexnow?url=/builds/foo → submit one URL (path or absolute)
//   GET /api/indexnow?dry=1           → show what WOULD be submitted, send nothing
//
// Submit when something actually changed. Re-submitting an unchanged set on a
// schedule is what gets a host de-prioritized, so there is deliberately no cron
// wired up here: the sitemap already handles routine discovery, and this exists
// for the "a build just went public, index it now" case.

const SITE = 'https://gdimension.app'
const KEY = '8f7ec277a3146178a9d0f40a969c013c'
const KEY_LOCATION = `${SITE}/${KEY}.txt`
// api.indexnow.org fans the submission out to every participating engine, so
// one call covers Bing, Yandex, Seznam and Naver.
const ENDPOINT = 'https://api.indexnow.org/IndexNow'
// The protocol caps a batch at 10,000 URLs. The sitemap is nowhere near that
// today; the slice is here so growth degrades into "submit the first N" rather
// than a rejected request.
const MAX_URLS = 10000

// Pull the <loc> values out of our own sitemap. Parsing our generated XML with
// a regex is fine — api/sitemap.js emits one <loc> per line with escaped
// content, and this never sees third-party markup.
async function sitemapUrls(host) {
  const res = await fetch(`https://${host}/sitemap.xml`, { headers: { accept: 'application/xml' } })
  if (!res.ok) throw new Error(`sitemap fetch failed: ${res.status}`)
  const xml = await res.text()
  const out = []
  const re = /<loc>([^<]+)<\/loc>/g
  let m
  while ((m = re.exec(xml)) !== null) {
    const loc = m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
    // IndexNow rejects a batch outright if any URL is off-host, so drop
    // anything that isn't ours rather than losing the whole submission.
    if (loc.startsWith(`${SITE}/`) || loc === `${SITE}/`) out.push(loc)
  }
  return out
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'gdimension.app'
  const parsed = new URL(req.url, `https://${host}`)
  const one = parsed.searchParams.get('url')
  const dry = parsed.searchParams.get('dry') === '1'

  const json = (status, body) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    // Never cache: this is an action, and a cached 200 would silently swallow
    // every later submission.
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(body, null, 2))
  }

  let urlList
  if (one) {
    // Accept a path ("/builds/foo") or a full URL, but only ever for our host —
    // an open submitter would let anyone push URLs under our key.
    let abs
    try {
      abs = one.startsWith('http') ? new URL(one) : new URL(one, SITE)
    } catch {
      return json(400, { ok: false, error: 'invalid url' })
    }
    if (abs.origin !== SITE) return json(400, { ok: false, error: 'url must be on gdimension.app' })
    urlList = [abs.toString()]
  } else {
    try {
      urlList = await sitemapUrls(host)
    } catch (err) {
      return json(502, { ok: false, error: String(err && err.message ? err.message : err) })
    }
  }

  if (!urlList.length) return json(400, { ok: false, error: 'no urls to submit' })
  const urls = urlList.slice(0, MAX_URLS)

  if (dry) return json(200, { ok: true, dryRun: true, count: urls.length, urls })

  let upstream
  try {
    upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'gdimension.app',
        key: KEY,
        keyLocation: KEY_LOCATION,
        urlList: urls,
      }),
    })
  } catch (err) {
    return json(502, { ok: false, error: String(err && err.message ? err.message : err) })
  }

  // 200 and 202 both mean accepted (202 = "received, key validation pending").
  // 422 is the one worth reading closely: it means the URLs did not match the
  // host or the key file could not be read.
  const text = await upstream.text().catch(() => '')
  return json(upstream.ok ? 200 : 502, {
    ok: upstream.ok,
    submitted: urls.length,
    upstreamStatus: upstream.status,
    upstreamBody: text.slice(0, 500),
  })
}
