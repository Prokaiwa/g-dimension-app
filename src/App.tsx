import { useState, useEffect, useRef, lazy, Suspense, type ComponentType } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { syncActiveCarFromServer, clearActiveCar } from './lib/activeCar'
import { TourProvider } from './tour/TourContext'
import TourOverlay from './tour/TourOverlay'
import { isOnboarded } from './lib/userProfile'
import { initMusic, setMusicAllowed, syncMusicPrefFromServer } from './lib/music'
import { prewarmSfx, syncSoundPrefFromServer } from './lib/sound'
import { initUiSfx } from './lib/uiSfx'
import { isChunkLoadError, reloadForStaleChunk } from './lib/chunkReload'
import { Analytics } from '@vercel/analytics/react'

// Eager — the app shell that must always be present (no route chunk of its own).
import AuthGateFallback from './components/AuthGateFallback'
import ErrorBanner from './components/ErrorBanner'
import RouteFallback from './components/RouteFallback'
import StartSplash from './components/StartSplash'

// Every route page is code-split (React.lazy). The app and the public /builds
// pages become separate chunks, so an in-app user never downloads public-page
// code and a public visitor never downloads the whole authenticated app. Each
// chunk loads on demand behind a dark Suspense fallback; the common chunks for
// the current "world" are prefetched on idle so navigation stays instant.

// A failed dynamic import is almost always a STALE CHUNK: a new version shipped
// while this tab was open/backgrounded, so the old hashed chunk URLs no longer
// exist and the server returns the HTML 404 page instead of JS — the
// "'text/html' is not a valid JavaScript MIME type" error. Reload once to pull
// the fresh index.html + new chunk names. The sessionStorage guard prevents a
// reload loop if the failure is something other than a stale deploy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() => factory().catch((err) => {
    if (isChunkLoadError(err) && reloadForStaleChunk()) {
      return new Promise<{ default: T }>(() => {}) // hang until the reload happens
    }
    throw err // a real error — let the error boundary handle it
  }))
}

// Auth / marketing
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'))
const SignupPage = lazyWithRetry(() => import('./pages/SignupPage'))
const AuthCallbackPage = lazyWithRetry(() => import('./pages/AuthCallbackPage'))
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'))
const WelcomePage = lazyWithRetry(() => import('./pages/WelcomePage'))

// Hub
const HomePage = lazyWithRetry(() => import('./pages/HomePage'))

// Garage
const GaragePage = lazyWithRetry(() => import('./pages/GaragePage'))
const GarageCarsPage = lazyWithRetry(() => import('./pages/GarageCarsPage'))
const GarageCarsEditPage = lazyWithRetry(() => import('./pages/GarageCarsEditPage'))
const GarageSnapshotPage = lazyWithRetry(() => import('./pages/GarageSnapshotPage'))
const GarageDocumentsPage = lazyWithRetry(() => import('./pages/GarageDocumentsPage'))
const GarageContactsPage = lazyWithRetry(() => import('./pages/GarageContactsPage'))
const GarageRemindersPage = lazyWithRetry(() => import('./pages/GarageRemindersPage'))
const GaragePdfPage = lazyWithRetry(() => import('./pages/GaragePdfPage'))

// Tuning
const TuningPage = lazyWithRetry(() => import('./pages/TuningPage'))
const TuningBuildSheetPage = lazyWithRetry(() => import('./pages/TuningBuildSheetPage'))
const TuningPartsPage = lazyWithRetry(() => import('./pages/TuningPartsPage'))
const TuningAddPage = lazyWithRetry(() => import('./pages/TuningAddPage'))
const TuningModGroupPage = lazyWithRetry(() => import('./pages/TuningModGroupPage'))
const TuningModDetailPage = lazyWithRetry(() => import('./pages/TuningModDetailPage'))
const TuningModEditPage = lazyWithRetry(() => import('./pages/TuningModEditPage'))
const TuningDiyPage = lazyWithRetry(() => import('./pages/TuningDiyPage'))
const TuningDiyEditPage = lazyWithRetry(() => import('./pages/TuningDiyEditPage'))
const TuningPartDetailPage = lazyWithRetry(() => import('./pages/TuningPartDetailPage'))
const TuningPartEditPage = lazyWithRetry(() => import('./pages/TuningPartEditPage'))

// Maintenance
const MaintenancePage = lazyWithRetry(() => import('./pages/MaintenancePage'))
const MaintenanceServicePage = lazyWithRetry(() => import('./pages/MaintenanceServicePage'))
const MaintenanceServiceNewPage = lazyWithRetry(() => import('./pages/MaintenanceServiceNewPage'))
const MaintenanceServiceEditPage = lazyWithRetry(() => import('./pages/MaintenanceServiceEditPage'))
const MaintenanceSessionDetailPage = lazyWithRetry(() => import('./pages/MaintenanceSessionDetailPage'))
const MaintenanceDetailPage = lazyWithRetry(() => import('./pages/MaintenanceDetailPage'))
const MaintenanceDetailNewPage = lazyWithRetry(() => import('./pages/MaintenanceDetailNewPage'))
const MaintenanceDetailEditPage = lazyWithRetry(() => import('./pages/MaintenanceDetailEditPage'))

// Timeline
const TimelinePage = lazyWithRetry(() => import('./pages/TimelinePage'))
const TimelineEntryNewPage = lazyWithRetry(() => import('./pages/TimelineEntryNewPage'))
const EntryDetailPage = lazyWithRetry(() => import('./pages/EntryDetailPage'))

// Featured (magazine)
const FeaturedPage = lazyWithRetry(() => import('./pages/FeaturedPage'))

// Profile & settings
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const SettingsArchivedPage = lazyWithRetry(() => import('./pages/SettingsArchivedPage'))

// Legal (public)
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'))
const PrivacyPolicyPage = lazyWithRetry(() => import('./pages/PrivacyPolicyPage'))

// Public (non-auth)
const PublicProfilePage = lazyWithRetry(() => import('./pages/PublicProfilePage'))
const PublicTimelinePage = lazyWithRetry(() => import('./pages/PublicTimelinePage'))
const PublicBuildSheetPage = lazyWithRetry(() => import('./pages/PublicBuildSheetPage'))
const PublicGaragePage = lazyWithRetry(() => import('./pages/PublicGaragePage'))
const PublicModDetailPage = lazyWithRetry(() => import('./pages/PublicModDetailPage'))
const PublicDiyPage = lazyWithRetry(() => import('./pages/PublicDiyPage'))
const PublicEntryDetailPage = lazyWithRetry(() => import('./pages/PublicEntryDetailPage'))
const PublicFeaturedPage = lazyWithRetry(() => import('./pages/PublicFeaturedPage'))

// Dev tools
const SpecTestPage = lazyWithRetry(() => import('./pages/SpecTestPage'))
const SoundTestPage = lazyWithRetry(() => import('./pages/SoundTestPage'))

// Auth + onboarding gate. 'loading' until resolved, then one of:
//   'anon'       — no session → /login
//   'onboarding' — signed in but hasn't claimed a handle → /welcome
//   'ready'      — signed in and onboarded
type GateState = 'loading' | 'anon' | 'onboarding' | 'ready'

function useAuthGate(): GateState {
  const [state, setState] = useState<GateState>('loading')

  useEffect(() => {
    let active = true
    async function evaluate(session: Session | null) {
      if (!session) { if (active) setState('anon'); return }
      const onboarded = await isOnboarded(session.user.id)
      if (active) setState(onboarded ? 'ready' : 'onboarding')
    }
    supabase.auth.getSession().then(({ data }) => evaluate(data.session))
    // IMPORTANT: supabase-js holds an internal auth lock for the duration of the
    // onAuthStateChange callback. evaluate() runs isOnboarded(), a DB query that
    // needs that same lock to attach a fresh access token — calling it straight
    // from here can deadlock, leaving the gate stuck on 'loading' (a black
    // screen) until a manual refresh. This bites on return after the token has
    // expired, when the SDK fires TOKEN_REFRESHED/SIGNED_IN. Defer out of the
    // callback so the lock is released before the query runs.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => evaluate(session), 0)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return state
}

// App pages: require a session AND a claimed handle.
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const state = useAuthGate()
  if (state === 'loading') return <AuthGateFallback />
  if (state === 'anon') return <Navigate to="/login" replace />
  if (state === 'onboarding') return <Navigate to="/welcome" replace />
  return <>{children}</>
}

// The /welcome claim screen: needs a session, but is only reachable while
// onboarding (already-onboarded users are bounced to /home so they can't
// re-trigger it).
function WelcomeRoute({ children }: { children: React.ReactNode }) {
  const state = useAuthGate()
  if (state === 'loading') return <AuthGateFallback />
  if (state === 'anon') return <Navigate to="/login" replace />
  if (state === 'ready') return <Navigate to="/home" replace />
  return <>{children}</>
}

// Root "/" is served the static marketing page (public/marketing.html) by
// Vercel on a cold load. This component only runs on in-app client navigation
// to "/", where we send the user back out to that same marketing front door —
// one source of truth, no shadow React landing page. In dev there's no
// marketing rewrite, so we fall back to /login to avoid a reload loop.
function RootRedirect() {
  useEffect(() => { if (!import.meta.env.DEV) window.location.replace('/') }, [])
  if (import.meta.env.DEV) return <Navigate to="/login" replace />
  return <RouteFallback />
}

export default function App() {
  // Background music plays on authenticated in-app routes. Public build pages
  // stay silent for anonymous visitors (they have no toggle), but a logged-in
  // viewer — usually the owner showing off their build — gets the full sound.
  const location = useLocation()
  const [hasSession, setHasSession] = useState(false)

  // Cold-launch START splash. Shows the first time this session the user lands on
  // an authenticated app route WITH a session — i.e. AFTER login/signup, or on a
  // cold PWA launch straight into the app. Never over the marketing/login/signup/
  // public-build pages, so a logged-out visitor doesn't get the app's boot moment.
  // Once per launch: sessionStorage resets when the PWA/tab is killed and reopened.
  const [showSplash, setShowSplash] = useState(false)
  const splashDone = useRef(false)
  useEffect(() => {
    if (splashDone.current || showSplash) return
    try {
      if (sessionStorage.getItem('gdim_splash_seen') === '1') { splashDone.current = true; return }
    } catch { /* ignore */ }
    const isAppRoute = /^\/(home|garage|tuning|maintenance|timeline|featured|profile|settings)(\/|$)/
      .test(location.pathname)
    if (hasSession && isAppRoute) setShowSplash(true)
  }, [hasSession, location.pathname, showSplash])
  const dismissSplash = () => {
    splashDone.current = true
    try { sessionStorage.setItem('gdim_splash_seen', '1') } catch { /* ignore */ }
    setShowSplash(false)
  }
  useEffect(() => {
    const p = location.pathname
    const isPublic = p === '/' || p.startsWith('/login') || p.startsWith('/signup')
      || p.startsWith('/welcome') || p.startsWith('/auth') || p.startsWith('/builds')
    setMusicAllowed(!isPublic || (p.startsWith('/builds') && hasSession))
  }, [location.pathname, hasSession])

  useEffect(() => {
    // Seed localStorage from server on every sign-in and on page load
    // when a session already exists (e.g. returning user, page refresh).
    syncActiveCarFromServer()
    syncSoundPrefFromServer()
    syncMusicPrefFromServer()
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setHasSession(!!session)
      // Defer out of the callback — these query Supabase, which needs the auth
      // lock this callback is still holding (see the note in useAuthGate).
      // Calling them inline can deadlock.
      if (event === 'SIGNED_IN') setTimeout(() => {
        syncActiveCarFromServer()
        syncSoundPrefFromServer()
        syncMusicPrefFromServer()
      }, 0)
      // Drop the cached active car on sign-out so the next account on this
      // browser can't inherit it (localStorage is not namespaced per user).
      // Sound/music don't need the same treatment — the next sign-in's sync
      // always overwrites them (the DB columns are NOT NULL, never ambiguous).
      if (event === 'SIGNED_OUT') clearActiveCar()
    })
    return () => subscription.unsubscribe()
  }, [])

  // Background music (default on, starts on first gesture) + warm the
  // file-based UI sounds so the first confirm uses the real sample.
  useEffect(() => {
    initMusic()
    initUiSfx() // one delegated listener: back / confirm / tick for every button
    const warmSfx = () => { prewarmSfx() }
    window.addEventListener('pointerdown', warmSfx, { once: true })
    window.addEventListener('touchstart', warmSfx, { once: true })
    return () => {
      window.removeEventListener('pointerdown', warmSfx)
      window.removeEventListener('touchstart', warmSfx)
    }
  }, [])

  // Block pinch-zoom app-wide so it reads as a native app on every page. iOS
  // Safari ignores the viewport `user-scalable=no` flag, so pinch must be
  // prevented in JS (double-tap zoom is handled by touch-action:manipulation in
  // index.css). Components that ever need their own zoom can stopPropagation.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', prevent)
    document.addEventListener('gesturechange', prevent)
    document.addEventListener('gestureend', prevent)
    return () => {
      document.removeEventListener('gesturestart', prevent)
      document.removeEventListener('gesturechange', prevent)
      document.removeEventListener('gestureend', prevent)
    }
  }, [])

  // Route prefetch (code-splitting companion). Warm the likely-first chunk for
  // this "world" immediately (parallel with the auth check, so the first screen
  // doesn't wait on a second round-trip), then warm the rest of that world on
  // idle so subsequent navigation never shows the dark fallback. import() is
  // module-cached, so these resolve to the same chunks the routes load.
  useEffect(() => {
    const isPublic = window.location.pathname.startsWith('/builds')

    if (isPublic) void import('./pages/PublicProfilePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
    else void import('./pages/HomePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })

    const warm = () => {
      if (isPublic) {
        void import('./pages/PublicGaragePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/PublicTimelinePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/PublicBuildSheetPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/PublicModDetailPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/PublicFeaturedPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
      } else {
        void import('./pages/GaragePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/GarageCarsPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/TuningPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/TuningBuildSheetPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/MaintenancePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/TimelinePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/FeaturedPage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
        void import('./pages/ProfilePage').catch((e) => { if (isChunkLoadError(e)) reloadForStaleChunk() })
      }
    }
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(warm, 1500)
    return () => clearTimeout(t)
  }, [])

  return (
    <TourProvider>
      {showSplash && <StartSplash onStart={dismissSplash} />}
      <ErrorBanner />
      <TourOverlay />
      {/* Vercel Web Analytics — tracks SPA route changes too, so the dashboard
          shows per-page detail (the raw <script> only logged the entry URL). */}
      <Analytics />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* Part 10 — Full Route Map */}
      {/* "/" cold-loads the static marketing page (vercel.json); this only
          handles in-app nav to "/" → bounce back to that marketing front door. */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* Public: email-confirmation + OAuth landing. Must NOT be protected —
          the gate would bounce before the URL token becomes a session. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/* Public: password-recovery link landing (resetPasswordForEmail redirectTo).
          Must NOT be protected — same race as /auth/callback above. */}
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      {/* Public legal pages — linkable from the marketing footer, Settings, and
          (required) Google's OAuth consent screen. */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/welcome" element={<WelcomeRoute><WelcomePage /></WelcomeRoute>} />
      <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />

      <Route path="/garage" element={<ProtectedRoute><GaragePage /></ProtectedRoute>} />
      <Route path="/garage/cars" element={<ProtectedRoute><GarageCarsPage /></ProtectedRoute>} />
      <Route path="/garage/cars/:carId/edit" element={<ProtectedRoute><GarageCarsEditPage /></ProtectedRoute>} />
      <Route path="/garage/snapshot" element={<ProtectedRoute><GarageSnapshotPage /></ProtectedRoute>} />
      <Route path="/garage/documents" element={<ProtectedRoute><GarageDocumentsPage /></ProtectedRoute>} />
      <Route path="/garage/contacts" element={<ProtectedRoute><GarageContactsPage /></ProtectedRoute>} />
      <Route path="/garage/reminders" element={<ProtectedRoute><GarageRemindersPage /></ProtectedRoute>} />
      <Route path="/garage/pdf" element={<ProtectedRoute><GaragePdfPage /></ProtectedRoute>} />

      <Route path="/tuning" element={<ProtectedRoute><TuningPage /></ProtectedRoute>} />
      <Route path="/tuning/build-sheet" element={<ProtectedRoute><TuningBuildSheetPage /></ProtectedRoute>} />
      <Route path="/tuning/parts-bin" element={<ProtectedRoute><TuningPartsPage /></ProtectedRoute>} />
      <Route path="/tuning/parts-bin/:partId" element={<ProtectedRoute><TuningPartDetailPage /></ProtectedRoute>} />
      <Route path="/tuning/parts-bin/:partId/edit" element={<ProtectedRoute><TuningPartEditPage /></ProtectedRoute>} />
      <Route path="/tuning/add" element={<ProtectedRoute><TuningAddPage /></ProtectedRoute>} />
      <Route path="/tuning/mod-group/:sessionId" element={<ProtectedRoute><TuningModGroupPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId" element={<ProtectedRoute><TuningModDetailPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId/edit" element={<ProtectedRoute><TuningModEditPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId/diy" element={<ProtectedRoute><TuningDiyPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId/diy/edit" element={<ProtectedRoute><TuningDiyEditPage /></ProtectedRoute>} />

      <Route path="/maintenance" element={<ProtectedRoute><MaintenancePage /></ProtectedRoute>} />
      <Route path="/maintenance/service" element={<ProtectedRoute><MaintenanceServicePage /></ProtectedRoute>} />
      <Route path="/maintenance/service/new" element={<ProtectedRoute><MaintenanceServiceNewPage /></ProtectedRoute>} />
      <Route path="/maintenance/service/edit/:sessionId" element={<ProtectedRoute><MaintenanceServiceEditPage /></ProtectedRoute>} />
      <Route path="/maintenance/detail" element={<ProtectedRoute><MaintenanceDetailPage /></ProtectedRoute>} />
      <Route path="/maintenance/detail/new" element={<ProtectedRoute><MaintenanceDetailNewPage /></ProtectedRoute>} />
      <Route path="/maintenance/detail/edit/:sessionId" element={<ProtectedRoute><MaintenanceDetailEditPage /></ProtectedRoute>} />
      <Route path="/maintenance/:sessionId" element={<ProtectedRoute><MaintenanceSessionDetailPage /></ProtectedRoute>} />

      <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
      <Route path="/timeline/new" element={<ProtectedRoute><TimelineEntryNewPage /></ProtectedRoute>} />
      <Route path="/timeline/entry/:entryId/edit" element={<ProtectedRoute><TimelineEntryNewPage /></ProtectedRoute>} />
      <Route path="/timeline/entry/:entryId" element={<ProtectedRoute><EntryDetailPage /></ProtectedRoute>} />

      <Route path="/featured" element={<ProtectedRoute><FeaturedPage /></ProtectedRoute>} />

      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/settings/archived" element={<ProtectedRoute><SettingsArchivedPage /></ProtectedRoute>} />

      {/* Non-authenticated public routes — Part 13 */}
      <Route path="/builds/:username" element={<PublicProfilePage />} />
      <Route path="/builds/:username/garage" element={<PublicGaragePage />} />
      <Route path="/builds/:username/timeline" element={<PublicTimelinePage />} />
      <Route path="/builds/:username/buildsheet" element={<PublicBuildSheetPage />} />
      <Route path="/builds/:username/mods/:modId" element={<PublicModDetailPage />} />
      <Route path="/builds/:username/mods/:modId/diy" element={<PublicDiyPage />} />
      <Route path="/builds/:username/timeline/entry/:entryId" element={<PublicEntryDetailPage />} />
      <Route path="/builds/:username/featured" element={<PublicFeaturedPage />} />

      {/* Dev tools. /spec-test WRITES test jobs/specs to a real car, so it's
          dev-only (stripped from production builds). /sound-test is read-only. */}
      {import.meta.env.DEV && <Route path="/spec-test" element={<ProtectedRoute><SpecTestPage /></ProtectedRoute>} />}
      <Route path="/sound-test" element={<ProtectedRoute><SoundTestPage /></ProtectedRoute>} />
      </Routes>
      </Suspense>
    </TourProvider>
  )
}
