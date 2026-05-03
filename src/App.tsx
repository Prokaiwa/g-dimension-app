import { Routes, Route } from 'react-router-dom'

// Auth / marketing
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

// Hub
import HomePage from './pages/HomePage'

// Garage
import GaragePage from './pages/GaragePage'
import GarageCarsPage from './pages/GarageCarsPage'
import GarageCarsNewPage from './pages/GarageCarsNewPage'
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

export default function App() {
  return (
    <Routes>
      {/* Part 10 — Full Route Map */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/home" element={<HomePage />} />

      <Route path="/garage" element={<GaragePage />} />
      <Route path="/garage/cars" element={<GarageCarsPage />} />
      <Route path="/garage/cars/new" element={<GarageCarsNewPage />} />
      <Route path="/garage/cars/:carId/edit" element={<GarageCarsEditPage />} />
      <Route path="/garage/snapshot" element={<GarageSnapshotPage />} />
      <Route path="/garage/documents" element={<GarageDocumentsPage />} />
      <Route path="/garage/contacts" element={<GarageContactsPage />} />
      <Route path="/garage/reminders" element={<GarageRemindersPage />} />
      <Route path="/garage/pdf" element={<GaragePdfPage />} />

      <Route path="/tuning" element={<TuningPage />} />
      <Route path="/tuning/build-sheet" element={<TuningBuildSheetPage />} />
      <Route path="/tuning/blueprint" element={<TuningBlueprintPage />} />
      <Route path="/tuning/parts-bin" element={<TuningPartsPage />} />
      <Route path="/tuning/add" element={<TuningAddPage />} />
      <Route path="/tuning/mods/:modId" element={<TuningModDetailPage />} />
      <Route path="/tuning/mods/:modId/edit" element={<TuningModEditPage />} />

      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/maintenance/:sessionId" element={<MaintenanceSessionDetailPage />} />
      <Route path="/maintenance/detail" element={<MaintenanceDetailPage />} />
      <Route path="/maintenance/detail/new" element={<MaintenanceDetailNewPage />} />

      <Route path="/timeline" element={<TimelinePage />} />
      <Route path="/timeline/entry/:entryId" element={<EntryDetailPage />} />

      <Route path="/photos" element={<PhotosPage />} />

      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/archived" element={<SettingsArchivedPage />} />

      {/* Non-authenticated public route — Part 13 */}
      <Route path="/builds/:username" element={<PublicProfilePage />} />
    </Routes>
  )
}
