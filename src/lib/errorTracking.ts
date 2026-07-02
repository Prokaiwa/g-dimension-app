// Sentry error tracking — loaded lazily on idle so it adds nothing to boot.
//
// No-ops entirely unless VITE_SENTRY_DSN is set (a build-time env var — set it
// in the Vercel project's Environment Variables, not .env.local, for prod).
// The Sentry dashboard is the "page that shows all errors": grouping, stack
// traces, device/browser info, and email alerts, on the free tier.
//
// Deliberately minimal: error capture only — no performance tracing, no
// session replay — to keep the payload small and the free-tier quota lean.

// The DSN is a PUBLIC identifier (it ships in every client bundle by design —
// same story as the Supabase anon key); inlining it as the fallback means
// error tracking is live with zero Vercel env config. VITE_SENTRY_DSN still
// takes precedence if ever set.
const FALLBACK_DSN =
  'https://a0e2dbc6cb20dbb1460b2e5619d95fe1@o4511663471591424.ingest.us.sentry.io/4511664513744896'

export function initErrorTracking(): void {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || FALLBACK_DSN
  if (!dsn) return

  const start = () => {
    import('@sentry/react')
      .then(Sentry => {
        Sentry.init({
          dsn,
          // Errors only — explicitly disable the heavier products.
          integrations: [],
          tracesSampleRate: 0,
          // Noise that is handled/benign elsewhere in the app:
          ignoreErrors: [
            // supabase-js Navigator Locks race on tab resume — benign,
            // self-recovering (see ErrorBanner's matching filter).
            /lock:sb-.*-auth-token/i,
            /Navigator LocksManager/i,
            /lock .* was released/i,
            // Stale-chunk loads are auto-reloaded by chunkReload.ts; the
            // reload itself is the fix, reporting each one is pure noise.
            /dynamically imported module/i,
            /module script failed/i,
            /valid JavaScript MIME type/i,
          ],
        })
        // Deterministic wiring check: visit any page with ?sentry-test in the
        // URL and one test event is sent AFTER init (no lazy-load race, no
        // console gymnastics). Sentry's onboarding stays stuck on "waiting
        // for this project's first error" until one event arrives — this is
        // the reliable way to feed it.
        if (window.location.search.includes('sentry-test')) {
          Sentry.captureMessage('Sentry wiring test — everything works', 'error')
        }
      })
      .catch(() => { /* tracking must never break the app */ })
  }

  // Defer off the critical path.
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback(start, { timeout: 4000 })
  } else {
    setTimeout(start, 2500)
  }
}
