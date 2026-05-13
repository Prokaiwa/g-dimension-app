import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { syncActiveCarFromServer } from './lib/activeCar'

// Auth / marketing
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

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
import TuningBlueprintPage from './pages/TuningBlueprintPage'
import TuningPartsPage from './pages/TuningPartsPage'
import TuningAddPage from './pages/TuningAddPage'
import TuningModDetailPage from './pages/TuningModDetailPage'
import TuningModEditPage from './pages/TuningModEditPage'

// Maintenance
import MaintenancePage from './pages/MaintenancePage'
import MaintenanceSessionDetailPage from './pages/MaintenanceSessionDetailPage'
import MaintenanceDetailPage from './pages/MaintenanceDetailPage'
import MaintenanceDetailNewPage from './pages/MaintenanceDetailNewPage'

// Timeline
import TimelinePage from './pages/TimelinePage'
import EntryDetailPage from './pages/EntryDetailPage'

// Photos
import PhotosPage from './pages/PhotosPage'

// Profile & settings
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import SettingsArchivedPage from './pages/SettingsArchivedPage'

// Public (non-auth)
import PublicProfilePage from './pages/PublicProfilePage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authed === null) return null
  if (!authed) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    // Seed localStorage from server on every sign-in and on page load
    // when a session already exists (e.g. returning user, page refresh).
    syncActiveCarFromServer()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') syncActiveCarFromServer()
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <Routes>
      {/* Part 10 — Full Route Map */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
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
      <Route path="/tuning/blueprint" element={<ProtectedRoute><TuningBlueprintPage /></ProtectedRoute>} />
      <Route path="/tuning/parts-bin" element={<ProtectedRoute><TuningPartsPage /></ProtectedRoute>} />
      <Route path="/tuning/add" element={<ProtectedRoute><TuningAddPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId" element={<ProtectedRoute><TuningModDetailPage /></ProtectedRoute>} />
      <Route path="/tuning/mods/:modId/edit" element={<ProtectedRoute><TuningModEditPage /></ProtectedRoute>} />

      <Route path="/maintenance" element={<ProtectedRoute><MaintenancePage /></ProtectedRoute>} />
      <Route path="/maintenance/:sessionId" element={<ProtectedRoute><MaintenanceSessionDetailPage /></ProtectedRoute>} />
      <Route path="/maintenance/detail" element={<ProtectedRoute><MaintenanceDetailPage /></ProtectedRoute>} />
      <Route path="/maintenance/detail/new" element={<ProtectedRoute><MaintenanceDetailNewPage /></ProtectedRoute>} />

      <Route path="/timeline" element={<ProtectedRoute><TimelinePage /></ProtectedRoute>} />
      <Route path="/timeline/entry/:entryId" element={<ProtectedRoute><EntryDetailPage /></ProtectedRoute>} />

      <Route path="/photos" element={<ProtectedRoute><PhotosPage /></ProtectedRoute>} />

      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/settings/archived" element={<ProtectedRoute><SettingsArchivedPage /></ProtectedRoute>} />

      {/* Non-authenticated public route — Part 13 */}
      <Route path="/builds/:username" element={<PublicProfilePage />} />
    </Routes>
  )
}
