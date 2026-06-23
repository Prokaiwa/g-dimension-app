import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { syncActiveCarFromServer } from './lib/activeCar'
import { isOnboarded } from './lib/userProfile'

// Home-map node icons — warm the bundled image asset so it never pops in
// during the Home zoom transition. (The other node icons are inline base64
// data URIs already embedded in the bundle, so only this one hits the network.)
import mapNodeFeatured from './assets/icons/home/home_featured.png'

// Auth / marketing
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import WelcomePage from './pages/WelcomePage'

// Hub
import HomePage from './pages/HomePage'

// Garage
import GaragePage from './pages/GaragePage'
import GarageCarsPage from './pages/GarageCarsPage'
import GarageCarsEditPage from './pages/GarageCarsEditPage'
import GarageSnapshotPage from './pages/GarageSnapshotPage'
import GarageDocumentsPage from './pages/GarageDocumentsPage'
import GarageContactsPage from './pages/GarageContactsPage'
import GarageRemindersPage from './pages/GarageRemindersPage'
import GaragePdfPage from './pages/GaragePdfPage'

// Tuning
import TuningPage from './pages/TuningPage'
import TuningBuildSheetPage from './pages/TuningBuildSheetPage'
import TuningPartsPage from './pages/TuningPartsPage'
import TuningAddPage from './pages/TuningAddPage'
import TuningModGroupPage from './pages/TuningModGroupPage'
import TuningModDetailPage from './pages/TuningModDetailPage'
import TuningModEditPage from './pages/TuningModEditPage'
import TuningDiyPage from './pages/TuningDiyPage'
import TuningDiyEditPage from './pages/TuningDiyEditPage'
import TuningPartDetailPage from './pages/TuningPartDetailPage'
import TuningPartEditPage from './pages/TuningPartEditPage'

// Maintenance
import MaintenancePage from './pages/MaintenancePage'
import MaintenanceServicePage from './pages/MaintenanceServicePage'
import MaintenanceServiceNewPage from './pages/MaintenanceServiceNewPage'
import MaintenanceServiceEditPage from './pages/MaintenanceServiceEditPage'
import MaintenanceSessionDetailPage from './pages/MaintenanceSessionDetailPage'
import MaintenanceDetailPage from './pages/MaintenanceDetailPage'
import MaintenanceDetailNewPage from './pages/MaintenanceDetailNewPage'
import MaintenanceDetailEditPage from './pages/MaintenanceDetailEditPage'

// Timeline
import TimelinePage from './pages/TimelinePage'
import TimelineEntryNewPage from './pages/TimelineEntryNewPage'
import EntryDetailPage from './pages/EntryDetailPage'

// Photos
import PhotosPage from './pages/PhotosPage'

// Featured (magazine)
import FeaturedPage from './pages/FeaturedPage'

// Profile & settings
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import SettingsArchivedPage from './pages/SettingsArchivedPage'

// Public (non-auth)
import PublicProfilePage from './pages/PublicProfilePage'
import PublicTimelinePage from './pages/PublicTimelinePage'
import PublicBuildSheetPage from './pages/PublicBuildSheetPage'
import PublicGaragePage from './pages/PublicGaragePage'
import PublicModDetailPage from './pages/PublicModDetailPage'
import PublicDiyPage from './pages/PublicDiyPage'
import PublicEntryDetailPage from './pages/PublicEntryDetailPage'
import PublicFeaturedPage from './pages/PublicFeaturedPage'

// Monitoring
import AuthGateFallback from './components/AuthGateFallback'
import ErrorBanner from './components/ErrorBanner'

// Dev tools
import SpecTestPage from './pages/SpecTestPage'
import SoundTestPage from './pages/SoundTestPage'

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
  useEffect(() => {
    // Seed localStorage from server on every sign-in and on page load
    // when a session already exists (e.g. returning user, page refresh).
    syncActiveCarFromServer()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Defer out of the callback — syncActiveCarFromServer() queries Supabase,
      // which needs the auth lock this callback is still holding (see the note in
      // useAuthGate). Calling it inline can deadlock.
      if (event === 'SIGNED_IN') setTimeout(() => { syncActiveCarFromServer() }, 0)
    })
    return () => subscription.unsubscribe()
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

  return (
    <>
      <ErrorBanner />
      <Routes>
      {/* Part 10 — Full Route Map */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
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

      <Route path="/photos" element={<ProtectedRoute><PhotosPage /></ProtectedRoute>} />
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
    </>
  )
}
