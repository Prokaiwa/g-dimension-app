// Catch-all for any URL that matches nothing.
//
// Until this existed, an unknown path rendered an EMPTY DOCUMENT — no header,
// no chevron, no text, nothing to tap. Found by walking `/photos`, a route this
// project's own docs claimed existed and never did: the screen was blank and
// there was no way back short of editing the URL. Every stale link, every
// mistyped path, every route removed in a refactor landed there.
//
// Deliberately NOT auth-gated. A signed-out visitor mistyping a build URL
// should be told the page isn't there, not bounced to a login screen that
// implies the content is behind an account.
import { useLocation, useNavigate } from 'react-router-dom'
import {
  GRADIENT_APP_BG, COLOR_ACCENT, FONT_UI, FONT_TITLE,
  SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL, RADIUS_BUTTON,
} from '../tokens'

const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: `${SPACE_XL}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))`,
      textAlign: 'center',
    }}>
      <p style={{
        fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 30,
        color: '#f5f5f5', margin: 0, lineHeight: 1.15,
      }}>
        Wrong turn.
      </p>

      <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: MUTED, margin: `${SPACE_SM}px 0 0`, lineHeight: 1.6, maxWidth: 300 }}>
        There's nothing at this address.
      </p>

      {/* The path itself, so a mistyped or stale link is diagnosable rather than
          mysterious. Clipped, because a long URL should not reflow the page. */}
      <p style={{
        fontFamily: FONT_UI, fontSize: 11, color: FAINT, margin: `${SPACE_SM}px 0 0`,
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {location.pathname}
      </p>

      <div style={{ display: 'flex', gap: SPACE_SM, marginTop: SPACE_LG, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/home')}
          style={{
            minHeight: 44, padding: '0 22px', borderRadius: RADIUS_BUTTON,
            background: COLOR_ACCENT, border: 'none', cursor: 'pointer', color: '#fff5dc',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
            textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent',
          }}>
          Your garage
        </button>
        {/* Public, so this one works whether or not they're signed in. */}
        <button
          onClick={() => navigate('/discover')}
          style={{
            minHeight: 44, padding: '0 22px', borderRadius: RADIUS_BUTTON,
            background: 'none', border: `1px solid ${COLOR_ACCENT}`, cursor: 'pointer', color: COLOR_ACCENT,
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
            textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent',
          }}>
          Discover builds
        </button>
      </div>
    </div>
  )
}
