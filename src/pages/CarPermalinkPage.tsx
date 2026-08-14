// Route: /c/:carId — the STABLE public address of a car.
//
// This exists for printed objects. Trading cards carry a QR code, and a
// printed QR can never be corrected once it is in someone's hand, so it must
// not encode anything the owner can change. `/builds/:username/garage` does:
// handles are editable in ProfilePage, so a handle change would silently break
// every card already mailed out, and a freed handle claimed by someone else
// would point the QR at a STRANGER'S garage. The car's UUID is immutable and
// unguessable, so it is the only safe thing to print.
//
// Resolution goes through `public_car_profiles`, the same view every /builds/*
// page reads, so this route can never expose a car the public garage wouldn't.
// A private (or deleted) car simply resolves to nothing, exactly as it should.
//
// Deliberately NOT auth-gated: a QR scanned by a stranger at a car meet must
// land on the build, not on a login wall.
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  GRADIENT_APP_BG, COLOR_ACCENT, FONT_UI, FONT_TITLE,
  SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL, RADIUS_BUTTON,
} from '../tokens'

const MUTED = 'rgba(240,228,200,0.5)'

// Validated before the query, not after. `.eq()` on a uuid column with a
// non-uuid string is a Postgres 22P02 error, which would surface as "something
// went wrong" when the truth is simply that the address is malformed.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function CarPermalinkPage() {
  const { carId } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<'loading' | 'missing' | 'error'>('loading')
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!carId || !UUID_RE.test(carId)) { setState('missing'); return }

      const { data, error } = await supabase
        .from('public_car_profiles')
        .select('id, username')
        .eq('id', carId)
        .maybeSingle()

      if (cancelled) return
      // A backend failure is NOT "this build is private" — the same distinction
      // PublicGaragePage draws. Telling someone their card is dead because the
      // network blipped would be a lie about a permanent object.
      if (error) { setState('error'); return }
      if (!data?.username) { setState('missing'); return }

      setTarget(`/builds/${encodeURIComponent(data.username)}/garage?car=${data.id}`)
    })()
    return () => { cancelled = true }
  }, [carId])

  if (target) return <Navigate to={target} replace />

  // Bare background while resolving. A spinner or "Opening..." would flash for
  // the ~200ms this usually takes and read as jank, and the destination runs
  // its own intro animation.
  if (state === 'loading') {
    return <div style={{ minHeight: '100dvh', background: GRADIENT_APP_BG }} />
  }

  const isError = state === 'error'

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
        {isError ? 'Could not load.' : 'Not public.'}
      </p>

      <p style={{ fontFamily: FONT_UI, fontSize: 13.5, color: MUTED, margin: `${SPACE_SM}px 0 0`, lineHeight: 1.6, maxWidth: 300 }}>
        {isError
          ? 'Something went wrong reaching this build. Check your connection and try again.'
          : 'This build is private, or it has not been published yet.'}
      </p>

      <div style={{ display: 'flex', gap: SPACE_SM, marginTop: SPACE_LG, flexWrap: 'wrap', justifyContent: 'center' }}>
        {isError && (
          <button
            onClick={() => { setState('loading'); setTarget(null); navigate(0) }}
            style={{
              minHeight: 44, padding: '0 22px', borderRadius: RADIUS_BUTTON,
              background: COLOR_ACCENT, border: 'none', cursor: 'pointer', color: '#fff5dc',
              fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
              textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent',
            }}>
            Try again
          </button>
        )}
        <button
          onClick={() => navigate('/discover')}
          style={{
            minHeight: 44, padding: '0 22px', borderRadius: RADIUS_BUTTON,
            background: isError ? 'none' : COLOR_ACCENT,
            border: isError ? `1px solid ${COLOR_ACCENT}` : 'none',
            cursor: 'pointer', color: isError ? COLOR_ACCENT : '#fff5dc',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em',
            textTransform: 'uppercase', WebkitTapHighlightColor: 'transparent',
          }}>
          Discover builds
        </button>
      </div>
    </div>
  )
}
