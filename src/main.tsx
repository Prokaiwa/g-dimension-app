import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { installChunkReloadGuard } from './lib/chunkReload'
import { initErrorTracking } from './lib/errorTracking'

// Auto-recover from stale chunks after a deploy (see chunkReload.ts). Installed
// before render so it catches failures from any source.
installChunkReloadGuard()

// Sentry (lazy, idle-loaded; no-op without VITE_SENTRY_DSN — see errorTracking.ts).
initErrorTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
