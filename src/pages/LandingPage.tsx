// Route: / — Landing / Marketing gate (Part 10, Part 14)
// Auth gate: dark background, logo, "START YOUR BUILD" → /signup, "Sign in" → /login

import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo/gdimensionlight.png'
import {
  COLOR_CAVITY_BG,
  GRADIENT_APP_BG,
  COLOR_ACCENT,
  COLOR_ACCENT_DIM,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  COLOR_BRAND,
  FONT_UI,
  FONT_TITLE,
  RADIUS_PILL,
  SCALE_PRESS_DEFAULT,
} from '../tokens'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: GRADIENT_APP_BG,
        backgroundColor: COLOR_CAVITY_BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        fontFamily: FONT_UI,
      }}
    >
      {/* Logo mark */}
      <img
        src={logo}
        alt="G-Dimension"
        style={{ width: 200, marginBottom: 48 }}
      />

      {/* Hero headline — Part 1 */}
      <p
        style={{
          fontFamily: FONT_TITLE,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 26,
          color: COLOR_TEXT_PRIMARY,
          textAlign: 'center',
          lineHeight: 1.3,
          margin: '0 0 12px',
        }}
      >
        Your build has a story.
      </p>
      <p
        style={{
          fontFamily: FONT_TITLE,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 26,
          color: COLOR_TEXT_PRIMARY,
          textAlign: 'center',
          lineHeight: 1.3,
          margin: '0 0 48px',
        }}
      >
        Give it somewhere to live.
      </p>

      {/* CTA — Part 14 */}
      <button
        onClick={() => navigate('/signup')}
        onMouseDown={(e) => { (e.currentTarget.style.transform = `scale(${SCALE_PRESS_DEFAULT})`) }}
        onMouseUp={(e) => { (e.currentTarget.style.transform = 'scale(1)') }}
        onMouseLeave={(e) => { (e.currentTarget.style.transform = 'scale(1)') }}
        style={{
          background: COLOR_ACCENT,
          color: '#ffffff',
          fontFamily: FONT_UI,
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          border: 'none',
          borderRadius: RADIUS_PILL,
          padding: '14px 40px',
          cursor: 'pointer',
          transition: 'background 200ms ease-out, transform 200ms ease-out',
          marginBottom: 20,
          minWidth: 220,
        }}
        onMouseEnter={(e) => { (e.currentTarget.style.background = COLOR_ACCENT_DIM) }}
      >
        Start Your Build
      </button>

      {/* Sign in link */}
      <button
        onClick={() => navigate('/login')}
        style={{
          background: 'none',
          border: 'none',
          color: COLOR_TEXT_SECONDARY,
          fontFamily: FONT_UI,
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          padding: '8px 16px',
        }}
      >
        Already have an account?{' '}
        <span style={{ color: COLOR_TEXT_PRIMARY, textDecoration: 'underline' }}>Sign in</span>
      </button>

      {/* Catchphrase — Part 1 */}
      <p
        style={{
          position: 'absolute',
          bottom: 32,
          fontFamily: FONT_UI,
          fontWeight: 400,
          fontSize: 11,
          color: COLOR_BRAND,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        Your build. Documented.
      </p>
    </div>
  )
}
