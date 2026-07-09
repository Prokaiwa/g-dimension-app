// Last-resort catch for render-time crashes anywhere in the app. Without this,
// React unmounts the ENTIRE tree on any uncaught render error — including this
// boundary's own siblings like ErrorBanner — leaving a blank white screen with
// no way back except a manual refresh. That's exactly what happened for a
// Safari/WebKit bug where a lazily-loaded route chunk's import() promise
// resolves with `undefined` instead of the module: React.lazy then throws
// "_result.default"/"reading 'default'" on the next render, invisible to our
// own lazyWithRetry (that .catch() only sees rejections, not a fulfilled-with-
// undefined promise) and never reaching window.onerror while the app is
// mid-render — it just went straight to a dead screen with only a silent
// Sentry report to show for it.
//
// isChunkLoadError() (broadened to recognize this signature too) drives the
// same silent-reload recovery as installChunkReloadGuard for a genuine stale
// chunk hash. Anything else gets a branded fallback instead of a blank screen,
// and is still forwarded to Sentry (a boundary-caught error does not reach
// window.onerror on its own, so GlobalHandlers wouldn't see it otherwise).
import { Component, type ReactNode } from 'react'
import { isChunkLoadError, reloadForStaleChunk } from '../lib/chunkReload'
import {
  GRADIENT_APP_BG, COLOR_ACCENT, COLOR_ACCENT_TEXT, FONT_UI, FONT_TITLE,
  SPACE_SM, SPACE_LG, RADIUS_BUTTON,
} from '../tokens'

type Props = { children: ReactNode }
type State = { status: 'ok' | 'reloading' | 'error' }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { status: 'ok' }

  static getDerivedStateFromError(): State {
    return { status: 'error' } // refined to 'reloading' in componentDidCatch if recognized
  }

  componentDidCatch(error: unknown): void {
    const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    if (isChunkLoadError(msg) && reloadForStaleChunk()) {
      this.setState({ status: 'reloading' })
      return
    }
    import('@sentry/react').then(Sentry => Sentry.captureException(error)).catch(() => { /* tracking must never break the app */ })
  }

  render() {
    if (this.state.status === 'reloading') {
      // Matches RouteFallback — bare dark canvas, no flash of text before the reload lands.
      return <div style={{ position: 'fixed', inset: 0, background: '#050507' }} aria-hidden />
    }
    if (this.state.status === 'error') {
      return (
        <div style={{ position: 'fixed', inset: 0, background: GRADIENT_APP_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_UI, padding: '0 32px', textAlign: 'center', zIndex: 9998 }}>
          <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: '#f5f5f5', margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.2 }}>
            Something went wrong.
          </p>
          <p style={{ fontWeight: 500, fontSize: 13.5, color: 'rgba(245,245,245,0.55)', lineHeight: 1.6, margin: `0 0 ${SPACE_LG}px`, maxWidth: 300 }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ minHeight: 44, padding: '0 22px', background: COLOR_ACCENT, border: 'none', borderRadius: RADIUS_BUTTON, color: COLOR_ACCENT_TEXT, fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
