# App Store / Play Store screenshots

Work in progress. Direction, panel arc and open decisions are in the session
discussion; this file covers only how to run the pipeline.

Two stages, both client-side, no design tool involved:

1. **Capture** real app screens at exact store pixels.
2. **Compose** marketing panels around them and render to store-ready PNGs.

## Run it

Both scripts need a local dev server and the proxy env vars (see *Container
notes* below).

```bash
npm run dev -- --port 5199 --strictPort          # in one shell

# Capture. With credentials it walks the authed screens; without, it falls
# back to the public /builds/* surfaces of GDIM_PUBLIC_USER.
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
  GDIM_EMAIL=... GDIM_PASSWORD=... \
  node scripts/capture-store-shots.mjs

# Compose one panel.
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
  node scripts/render-store-panel.mjs design/store-shots/panel-01.html
```

Raw captures land in `design/store-shots/raw/`, renders next to their source
HTML. **Both are gitignored** — they are regenerable, and committing them would
add a multi-MB blob per iteration. The composition source (`panel-*.html`) is
tracked.

## Sizes

| Target | Pixels | Notes |
|---|---|---|
| Apple 6.9" | 1290 × 2796 | The capture size. 430 × 932 CSS at `deviceScaleFactor: 3` |
| Apple 6.5" | 1242 × 2688 | |
| Play phone | 1080 × 1920 | |
| Play feature graphic | 1024 × 500 | Required by Play, easy to forget |

Apple 6.9" is 2.17:1 but **Play caps screenshot aspect ratio at 2:1**, so
Android needs its own composition rather than a resize of the iOS panel. Apple
takes up to 10 screenshots, Play 2–8. Confirm current requirements against the
store docs before a real submission — they move.

## Container notes

Three things bite in the web-container environment, all handled in the scripts:

- **Chromium has no network egress.** Every request to `*.supabase.co`,
  `fonts.googleapis.com` and `fonts.gstatic.com` is intercepted and relayed
  through Node's `fetch` (which works with `NODE_USE_ENV_PROXY=1` and
  `NODE_EXTRA_CA_CERTS`). `content-encoding`/`content-length` must be stripped
  from the relayed response or the browser cannot parse the body. Without the
  **font** hosts relayed, Anton and Oswald fall back silently and every
  headline renders with the wrong metrics.
- **The cold-launch splash blocks every route** until tapped. Seeded with
  `sessionStorage.setItem('gdim_splash_seen', '1')` via `addInitScript`.
- **The pinned Playwright wants a browser build the image does not carry.**
  Launch with an explicit `executablePath` (override with `GDIM_CHROMIUM`);
  never run `playwright install` here.

The first two are the same obstacles documented in `BUILD_NOTES.md` under
"Driving the live app from a container session".

## Two approaches that do not work

Recorded so they are not re-tried:

- **Upscaling the art to crop the app header** also crops the left and right
  edges, which chopped "YEAR" off the garage info strip.
- **Capturing a taller viewport** (430 × 1050) to give the crop headroom lands
  the entry animations mid-flight, stamping ghost `CHOOSE`/`DETAILS` labels
  under the header.

Capture at the native 430 × 932 and overlay type on the garage stage's own
darkness instead. No crop, no upscale.
