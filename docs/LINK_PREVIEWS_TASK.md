# Task: Per-build link previews (per-build Open Graph)

**Goal:** when someone shares a public build link — `/builds/:username` (and its
sub-pages: `/garage`, `/buildsheet`, `/timeline`, `/featured`, `/mods/:id`) —
the unfurl (iMessage, X, Discord, Slack, Facebook, WhatsApp) should show **that
car's name and photo**, not the generic G-Dimension logo.

## Why it needs server work
The app is a **client-rendered SPA** (Vite + React Router). Link unfurlers and
many crawlers don't run JS, so the `<meta property="og:*">` tags must be present
in the **HTML the server returns**. Today every non-root route falls through to
`index.html`, which only has the **generic default** OG tags (added already:
`og-default.png` = the branded `gdimensiondark.png`). So all build links unfurl
identically. We need the server to inject per-build OG tags for `/builds/*`.

## What already exists (don't redo)
- `public/og-default.png` (1200×600 branded) + default OG/Twitter/description
  meta in `index.html` — the fallback.
- `public/robots.txt`, `public/sitemap.xml`.
- `vercel.json` with: a global security-headers route (incl. a strict **CSP**),
  `^/$ → /marketing.html`, `{ "handle": "filesystem" }`, then `^/(.*) → /index.html`
  (SPA fallback). **The new /builds OG handler must come BEFORE the SPA fallback.**

## Data: where the build info lives
- Public, anon-readable view **`public_car_profiles`** (RLS allows anon SELECT
  for `is_public = true` cars). Relevant columns:
  - Identity: `year, make, model, variant, nickname, username, display_name`
  - Photos (best→worst for OG): **`original_photo_url`** (full photo) →
    `showcase_photo_url` → `garage_photo_url` (a transparent PNG cutout — looks
    bad on OG, last resort) → fall back to `/og-default.png`.
  - `is_public`, `active_car_id`, and per-section flags
    (`show_featured_publicly` etc.).
- **Resolving username → car** (mirror `PublicProfilePage.tsx` ~line 251–265):
  query `public_car_profiles` by `username`; pick the `?car=<id>` query param if
  present, else the row whose `id === active_car_id`, else the first row. If no
  public car / username not found → use the generic default OG (don't leak, and
  don't 500).
- Supabase: URL `https://uxqoernfrtgclpneirvc.supabase.co`. The **anon key is
  already public** (shipped in the client bundle), so the server handler may read
  it from a Vercel env var (preferred) or use it directly. NOTE: client `VITE_*`
  vars are build-time only — for a runtime function, add **`SUPABASE_URL` +
  `SUPABASE_ANON_KEY`** as Vercel project env vars (or inline the public values).

## Recommended approach
A **Vercel serverless function** (Node) that handles `/builds/*`:
1. `vercel.json`: add a rewrite `"/builds/(.*)" → "/api/og"` (or similar) placed
   **before** the SPA fallback and after the filesystem handler.
2. The function: parse the path + `?car`, fetch the car from
   `public_car_profiles`, read the built **`index.html`** from the deployment,
   string-replace the default OG/Twitter/title/description tags with per-build
   values, and return the modified HTML (status 200, `content-type: text/html`).
   Crucially it returns the **full index.html** (scripts intact) so the SPA still
   boots normally for real users — no user-agent sniffing needed.
3. OG values:
   - `og:title` / `twitter:title`: e.g. `"<year> <make> <model> <variant>"`,
     or the nickname if set, + " · G-Dimension".
   - `og:description`: short, e.g. owner/handle + a tagline.
   - `og:image` / `twitter:image`: absolute URL to the chosen photo (or
     og-default.png). Must be an absolute `https://gdimension.app/...` or the
     Supabase public URL.
   - `og:url`: the canonical build URL.

### Gotchas
- **CSP**: injected tags are just `<meta>` — fine. Don't add inline scripts.
  The OG image host must be reachable by crawlers (Supabase public bucket URLs
  are fine; they're already in `img-src` for the app, but crawlers fetch the
  image directly so CSP doesn't gate them — just use absolute URLs).
- **Reading index.html in the function**: in Vercel, bundle/read it reliably
  (e.g., `fs.readFileSync(path.join(process.cwd(), 'index.html'|'dist/index.html'))`
  — verify the correct path in the Vercel runtime, or fetch the deployed asset).
  Confirm asset paths in the returned HTML stay absolute so the SPA still loads.
- **Don't break humans**: returning the real index.html means React hydrates and
  client-side routing takes over — verify a normal visit to a build page still
  works (not just the bot view).
- **Privacy**: only expose public cars. The view already gates on `is_public`;
  for private/missing, return generic OG.
- **viewport-fit / existing meta**: replace the *existing* default OG tags, don't
  duplicate them (dedupe or the unfurler may pick the wrong one).

## Acceptance test
- Deploy, then run a public build URL through a sharing debugger
  (e.g. opengraph.xyz, or X/Facebook/LinkedIn post inspectors): title + image
  reflect that car.
- A real browser visit to the same URL still loads the SPA normally.
- A private/nonexistent username shows the generic G-Dimension preview, no error.

## Status: NOT STARTED.
