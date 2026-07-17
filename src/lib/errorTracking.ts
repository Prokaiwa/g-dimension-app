// Sentry error tracking — loaded lazily on idle so it adds nothing to boot.
//
// No-ops entirely unless VITE_SENTRY_DSN is set (a build-time env var — set it
// in the Vercel project's Environment Variables, not .env.local, for prod).
// The Sentry dashboard is the "page that shows all errors": grouping, stack
// traces, device/browser info, and email alerts, on the free tier.
//
// Deliberately minimal: error capture only — no performance tracing, no
// session replay — to keep the payload small and the free-tier quota lean.
import { CHUNK_LOAD_ERROR_PATTERN } from './chunkReload'

// The DSN is a PUBLIC identifier (it ships in every client bundle by design —
// same story as the Supabase anon key); inlining it as the fallback means
// error tracking is live with zero Vercel env config. VITE_SENTRY_DSN still
// takes precedence if ever set.
const FALLBACK_DSN =
  'https://a0e2dbc6cb20dbb1460b2e5619d95fe1@o4511663471591424.ingest.us.sentry.io/4511664513744896'

type SentryModule = typeof import('@sentry/react')

// Single lazy module promise: init and the helpers below all await the same
// load, so a helper called before the idle init simply forces the load early
// instead of dropping the event.
let sentryPromise: Promise<SentryModule> | null = null

function loadSentry(): Promise<SentryModule> {
  if (sentryPromise) return sentryPromise
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || FALLBACK_DSN
  sentryPromise = import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn,
      // Which deploy + environment produced the error. Vercel injects these
      // (VITE_-prefixed system env vars) when "Automatically expose System
      // Environment Variables" is on; both are optional and simply absent on
      // local dev builds.
      release: (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined) || undefined,
      environment: (import.meta.env.VITE_VERCEL_ENV as string | undefined) || import.meta.env.MODE,
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
        // Stale-chunk loads are auto-reloaded by chunkReload.ts (or shown
        // a branded "Reload" button by AppErrorBoundary if the per-session
        // reload budget is already spent) — the recovery IS the fix, so
        // reporting each one is pure noise. Shares the exact pattern
        // chunkReload.ts uses to recognize/recover from these, so this
        // list can't silently drift out of sync with what's actually
        // handled (it did once: a broadened Safari signature landed in
        // isChunkLoadError() without a matching update here, so an
        // already-recovered case still paged as a "new" Sentry error).
        CHUNK_LOAD_ERROR_PATTERN,
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
    return Sentry
  })
  // Tracking must never break the app — but keep the rejected promise so a
  // failed load isn't retried on every later helper call.
  sentryPromise.catch(() => {})
  return sentryPromise
}

export function initErrorTracking(): void {
  // Defer off the critical path.
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback(() => loadSentry(), { timeout: 4000 })
  } else {
    setTimeout(() => loadSentry(), 2500)
  }
}

/**
 * Tag every subsequent error with the signed-in user (id only — never email),
 * so a beta tester's crash can be traced to "whose phone" without them having
 * to report it. Pass null on sign-out.
 */
export function setErrorTrackingUser(userId: string | null): void {
  // Only attaches to an already-started load — identity tagging alone is not
  // worth pulling the SDK chunk early. (The idle init runs within seconds of
  // boot, well before any sign-in completes, so in practice this never skips.)
  sentryPromise?.then(S => S.setUser(userId ? { id: userId } : null)).catch(() => {})
}

/**
 * Report a HANDLED failure (a failed save the UI already surfaced via
 * reportActionError) so it's visible remotely too. Forces the SDK to load if
 * the idle init hasn't fired yet — a failed write is exactly what error
 * tracking exists for.
 */
export function captureHandledError(message: string, error?: unknown): void {
  loadSentry().then(S => {
    S.withScope(scope => {
      scope.setTag('handled', 'action-error')
      if (error !== undefined) {
        const detail = error instanceof Error
          ? error.message
          : String((error as { message?: unknown } | null)?.message ?? error)
        scope.setExtra('detail', detail)
      }
      S.captureMessage(message, 'error')
    })
  }).catch(() => {})
}
