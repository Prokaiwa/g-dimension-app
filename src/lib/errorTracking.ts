// Sentry error tracking — loaded lazily on idle so it adds nothing to boot.
//
// No-ops entirely unless VITE_SENTRY_DSN is set (a build-time env var — set it
// in the Vercel project's Environment Variables, not .env.local, for prod).
// The Sentry dashboard is the "page that shows all errors": grouping, stack
// traces, device/browser info, and email alerts, on the free tier.
//
// Deliberately minimal: error capture only — no performance tracing, no
// session replay — to keep the payload small and the free-tier quota lean.

export function initErrorTracking(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
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
