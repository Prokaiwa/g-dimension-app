import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import { installChunkReloadGuard } from './lib/chunkReload'
import { installKeyboardScroll } from './lib/keyboardScroll'
import { initErrorTracking } from './lib/errorTracking'
import { registerSW } from 'virtual:pwa-register'

// Auto-recover from stale chunks after a deploy (see chunkReload.ts). Installed
// before render so it catches failures from any source.
installChunkReloadGuard()

// Keep a focused text field clear of the on-screen keyboard (Android especially;
// see keyboardScroll.ts). Global listeners, so it covers every form.
installKeyboardScroll()

// Register the PWA service worker (config in vite.config.ts). autoUpdate: a new
// deploy's SW takes over and refreshes the cached shell on next load. Registered
// from this bundled module (not an inline <script>), so the CSP hash allowlist
// in vercel.json stays untouched. No-op in dev (devOptions.enabled: false).
registerSW({ immediate: true })

// Sentry (lazy, idle-loaded; no-op without VITE_SENTRY_DSN — see errorTracking.ts).
initErrorTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
