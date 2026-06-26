import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { syncActiveCarFromServer, clearActiveCar } from './lib/activeCar'
import { TourProvider } from './tour/TourContext'
import TourOverlay from './tour/TourOverlay'
import { isOnboarded } from './lib/userProfile'
import { initMusic, setMusicAllowed } from './lib/music'
import { prewarmSfx } from './lib/sound'
import { initUiSfx } from './lib/uiSfx'

// Home-map node icons — warm the bundled image asset so it never pops in
// during the Home zoom transition. (The other node icons are inline base64
// data URIs already embedded in the bundle, so only this one hits the network.)
import mapNodeFeatured from './assets/icons/home/home_featured.png'

// Eager — the app shell that must always be present (no route chunk of its own).
import AuthGateFallback from './components/AuthGateFallback'
import ErrorBanner from './components/ErrorBanner'
import RouteFallback from './components/RouteFallback'

// Every route page is code-split (React.lazy). The app and the public /builds
// pages become separate chunks, so an in-app user never downloads public-page
// code and a public visitor never downloads the whole authenticated app. Each
// chunk loads on demand behind a dark Suspense fallback; the common chunks for
// the current "world" are prefetched on idle so navigation stays instant.

// Auth / marketing
const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const WelcomePage = lazy(() => import('./pages/WelcomePage'))

// Hub
const HomePage = lazy(() => import('./pages/HomePage'))

// Garage
const GaragePage = lazy(() => import('./pages/GaragePage'))
const GarageCarsPage = lazy(() => import('./pages/GarageCarsPage'))
const GarageCarsEditPage = lazy(() => import('./pages/GarageCarsEditPage'))
const GarageSnapshotPage = lazy(() => import('./pages/GarageSnapshotPage'))
const GarageDocumentsPage = lazy(() => import('./pages/GarageDocumentsPage'))
const GarageContactsPage = lazy(() => import('./pages/GarageContactsPage'))
const GarageRemindersPage = lazy(() => import('./pages/GarageRemindersPage'))
const GaragePdfPage = lazy(() => import('./pages/GaragePdfPage'))

// Tuning
const TuningPage = lazy(() => import('./pages/TuningPage'))
const TuningBuildSheetPage = lazy(() => import('./pages/TuningBuildSheetPage'))
const TuningPartsPage = lazy(() => import('./pages/TuningPartsPage'))
const TuningAddPage = lazy(() => import('./pages/TuningAddPage'))
const TuningModGroupPage = lazy(() => import('./pages/TuningModGroupPage'))
const TuningModDetailPage = lazy(() => import('./pages/TuningModDetailPage'))
const TuningModEditPage = lazy(() => import('./pages/TuningModEditPage'))
const TuningDiyPage = lazy(() => import('./pages/TuningDiyPage'))
const TuningDiyEditPage = lazy(() => import('./pages/TuningDiyEditPage'))
const TuningPartDetailPage = lazy(() => import('./pages/TuningPartDetailPage'))
const TuningPartEditPage = lazy(() => import('./pages/TuningPartEditPage'))

// Maintenance
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'))
const MaintenanceServicePage = lazy(() => import('./pages/MaintenanceServicePage'))
const MaintenanceServiceNewPage = lazy(() => import('./pages/MaintenanceServiceNewPage'))
const MaintenanceServiceEditPage = lazy(() => import('./pages/MaintenanceServiceEditPage'))
const MaintenanceSessionDetailPage = lazy(() => import('./pages/MaintenanceSessionDetailPage'))
const MaintenanceDetailPage = lazy(() => import('./pages/MaintenanceDetailPage'))
const MaintenanceDetailNewPage = lazy(() => import('./pages/MaintenanceDetailNewPage'))
const MaintenanceDetailEditPage = lazy(() => import('./pages/MaintenanceDetailEditPage'))

// Timeline
const TimelinePage = lazy(() => import('./pages/TimelinePage'))
const TimelineEntryNewPage = lazy(() => import('./pages/TimelineEntryNewPage'))
const EntryDetailPage = lazy(() => import('./pages/EntryDetailPage'))

// Featured (magazine)
const FeaturedPage = lazy(() => import('./pages/FeaturedPage'))

// Profile & settings
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const SettingsArchivedPage = lazy(() => import('./pages/SettingsArchivedPage'))

// Public (non-auth)
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const PublicTimelinePage = lazy(() => import('./pages/PublicTimelinePage'))
const PublicBuildSheetPage = lazy(() => import('./pages/PublicBuildSheetPage'))
const PublicGaragePage = lazy(() => import('./pages/PublicGaragePage'))
const PublicModDetailPage = lazy(() => import('./pages/PublicModDetailPage'))
const PublicDiyPage = lazy(() => import('./pages/PublicDiyPage'))
const PublicEntryDetailPage = lazy(() => import('./pages/PublicEntryDetailPage'))
const PublicFeaturedPage = lazy(() => import('./pages/PublicFeaturedPage'))

// Dev tools
const SpecTestPage = lazy(() => import('./pages/SpecTestPage'))
const SoundTestPage = lazy(() => import('./pages/SoundTestPage'))

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

export default function App() {
  // Background music plays only on authenticated in-app routes, never on the
  // landing / auth / public build pages (visitors there have no toggle).
  const location = useLocation()
  useEffect(() => {
    const p = location.pathname
    const isPublic = p === '/' || p.startsWith('/login') || p.startsWith('/signup')
      || p.startsWith('/welcome') || p.startsWith('/auth') || p.startsWith('/builds')
    setMusicAllowed(!isPublic)
  }, [location.pathname])

  useEffect(() => {
    // Seed localStorage from server on every sign-in and on page load
    // when a session already exists (e.g. returning user, page refresh).
    syncActiveCarFromServer()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Defer out of the callback — syncActiveCarFromServer() queries Supabase,
      // which needs the auth lock this callback is still holding (see the note in
      // useAuthGate). Calling it inline can deadlock.
      if (event === 'SIGNED_IN') setTimeout(() => { syncActiveCarFromServer() }, 0)
      // Drop the cached active car on sign-out so the next account on this
      // browser can't inherit it (localStorage is not namespaced per user).
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

  // Idle-preload Home-map node icon assets so they don't pop in mid-zoom.
  useEffect(() => {
    const warm = () => { const img = new Image(); img.src = mapNodeFeatured }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = (window as typeof window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(warm, { timeout: 2000 })
      return () => (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id)
    }
    const id = setTimeout(warm, 300)
    return () => clearTimeout(id)
  }, [])

  // Route prefetch (code-splitting companion). Warm the likely-first chunk for
  // this "world" immediately (parallel with the auth check, so the first screen
  // doesn't wait on a second round-trip), then warm the rest of that world on
  // idle so subsequent navigation never shows the dark fallback. import() is
  // module-cached, so these resolve to the same chunks the routes load.
  useEffect(() => {
    const isPublic = window.location.pathname.startsWith('/builds')

    if (isPublic) void import('./pages/PublicProfilePage')
    else void import('./pages/HomePage')

    const warm = () => {
      if (isPublic) {
        void import('./pages/PublicGaragePage')
        void import('./pages/PublicTimelinePage')
        void import('./pages/PublicBuildSheetPage')
        void import('./pages/PublicModDetailPage')
        void import('./pages/PublicFeaturedPage')
      } else {
        void import('./pages/GaragePage')
        void import('./pages/GarageCarsPage')
        void import('./pages/TuningPage')
        void import('./pages/TuningBuildSheetPage')
        void import('./pages/MaintenancePage')
        void import('./pages/TimelinePage')
        void import('./pages/FeaturedPage')
        void import('./pages/ProfilePage')
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
      <ErrorBanner />
      <TourOverlay />
      <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* Part 10 — Full Route Map */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* Public: email-confirmation + OAuth landing. Must NOT be protected —
          the gate would bounce before the URL token becomes a session. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
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

      {/* Dev tools */}
      <Route path="/spec-test" element={<ProtectedRoute><SpecTestPage /></ProtectedRoute>} />
      <Route path="/sound-test" element={<ProtectedRoute><SoundTestPage /></ProtectedRoute>} />
      </Routes>
      </Suspense>
    </TourProvider>
  )
}
