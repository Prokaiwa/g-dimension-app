// Route: /builds/:username/sold/:ghostId — a shareable "this car was sold" card.
//
// The public landing for a SOLD ghost (migration 074, ADR-019). Shows the frozen
// snapshot of a car the seller (:username) transferred away, and points visitors
// to the new owner's build. Fed by the anon-readable public_sold_cars view via
// getPublicSoldCar(). Link previews are handled server-side in api/og.js.
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPublicSoldCar, soldCarName, type PublicSoldCar } from '../lib/carTransfers'
import { shareLink } from '../lib/share'
import garagePlaceholder from '../assets/garage_placeholder.webp'
import {
  COLOR_CAVITY_BG,
  COLOR_BURGUNDY_M,
  COLOR_BRAND,
  COLOR_ACCENT,
  COLOR_HEADER_TITLE,
  FONT_UI,
  FONT_TITLE,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  RADIUS_BADGE,
} from '../tokens'

export default function PublicSoldCarPage() {
  const navigate = useNavigate()
  const { username, ghostId } = useParams<{ username: string; ghostId: string }>()
  const [ghost, setGhost] = useState<PublicSoldCar | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [shared, setShared] = useState(false)
  const hasHistory = useRef(typeof window !== 'undefined' && window.history.length > 1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!ghostId) { setState('missing'); return }
      const g = await getPublicSoldCar(ghostId)
      if (cancelled) return
      if (!g) { setState('missing'); return }
      setGhost(g)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [ghostId])

  const back = () => {
    if (hasHistory.current) navigate(-1)
    else navigate(`/builds/${username ?? ''}`)
  }

  async function onShare() {
    if (!ghost) return
    const url = `${window.location.origin}/builds/${ghost.seller_username ?? username}/sold/${ghost.id}`
    const name = soldCarName(ghost)
    const res = await shareLink({
      url,
      title: `${name} — sold on G-Dimension`,
      text: ghost.buyer_username ? `${name} was sold to @${ghost.buyer_username}.` : `${name} was sold.`,
    })
    if (res === 'copied') { setShared(true); setTimeout(() => setShared(false), 1800) }
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: COLOR_CAVITY_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes psoldspin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width: 30, height: 30, borderRadius: '50%', border: '2.5px solid rgba(245,245,245,0.12)', borderTopColor: COLOR_BURGUNDY_M, animation: 'psoldspin 750ms linear infinite' }} />
      </div>
    )
  }

  if (state === 'missing' || !ghost) {
    return (
      <div style={{ minHeight: '100dvh', background: COLOR_CAVITY_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', fontFamily: FONT_UI }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: 'rgba(245,245,245,0.85)' }}>Not found</div>
        <div style={{ fontSize: 13, color: 'rgba(245,245,245,0.45)', maxWidth: 260, lineHeight: 1.5 }}>This sold-car record is private or no longer exists.</div>
        <button onClick={back} style={{ marginTop: 8, padding: '9px 18px', borderRadius: 10, border: 'none', background: COLOR_BURGUNDY_M, color: '#f5f0ea', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Back</button>
      </div>
    )
  }

  const name = soldCarName(ghost)

  return (
    <div style={{ minHeight: '100dvh', background: 'radial-gradient(ellipse 90% 55% at 50% 42%, #201d1b 0%, #121010 45%, #0b0908 68%, #07070a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${SPACE_LG}px ${SPACE_MD}px`, fontFamily: FONT_UI, textAlign: 'center' }}>
      {/* Dimmed car + SOLD stamp */}
      <div style={{ position: 'relative', width: 'min(360px, 82vw)', marginBottom: SPACE_LG }}>
        <img
          src={ghost.snapshot_photo_url || garagePlaceholder}
          alt={name}
          style={{ width: '100%', maxHeight: 220, objectFit: 'contain', filter: 'grayscale(0.65) brightness(0.7) drop-shadow(0 8px 14px rgba(0,0,0,0.9))', opacity: 0.92 }}
        />
        <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%) rotate(-9deg)', border: `3px solid ${COLOR_BRAND}`, color: COLOR_BRAND, borderRadius: RADIUS_BADGE, padding: '5px 20px', fontFamily: FONT_UI, fontWeight: 900, fontSize: 38, letterSpacing: '0.14em', opacity: 0.95, background: 'rgba(10,8,8,0.32)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          SOLD
        </div>
      </div>

      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: COLOR_HEADER_TITLE, margin: `0 0 6px`, lineHeight: 1.15 }}>{name}</p>
      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: 'rgba(245,240,228,0.6)', margin: 0, lineHeight: 1.6, maxWidth: 300 }}>
        {ghost.buyer_username
          ? <>was sold by @{ghost.seller_username} to <span style={{ color: COLOR_ACCENT, fontWeight: 700 }}>@{ghost.buyer_username}</span>.</>
          : <>was sold by @{ghost.seller_username}.</>}
        {' '}Its build lives on with the new owner.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM, marginTop: SPACE_LG, width: 'min(320px, 82vw)' }}>
        {ghost.buyer_username && (
          <button onClick={() => navigate(`/builds/${ghost.buyer_username}${ghost.car_id ? `?car=${ghost.car_id}` : ''}`)}
            style={{ padding: '14px', background: COLOR_ACCENT, border: 'none', color: '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 10 }}>
            Visit @{ghost.buyer_username}'s Build
          </button>
        )}
        <button onClick={onShare}
          style={{ padding: '12px', background: 'none', border: '1px solid rgba(245,245,245,0.22)', color: 'rgba(245,245,245,0.75)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 10 }}>
          {shared ? 'Link Copied' : 'Share'}
        </button>
        <button onClick={back}
          style={{ padding: '8px', background: 'none', border: 'none', color: 'rgba(245,245,245,0.4)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
          Back
        </button>
      </div>
    </div>
  )
}
