// Route: /featured — "Featured" magazine (Part 10 replacement for /photos)
// PROTOTYPE: the COVER only. 4 deterministic-but-swipeable cover templates,
// each with its own theme, wired to the active car's real data.
// Aesthetic island (like Parts Bin) — uses FONT_MASTHEAD/FONT_DECK, not the app type.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_MASTHEAD,
  FONT_DECK,
  COLOR_BRAND,
  COLOR_ACCENT,
  EASING_SETTLE,
} from '../tokens'
import gLogo from '../assets/logo/gdimensionG.png'

interface Car {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  nickname: string | null
  horsepower: number | null
  forced_induction: string | null
  drivetrain: string | null
  purchase_date: string | null
  showcase_photo_url: string | null
  garage_photo_url: string | null
}

type Photo = { url: string; mode: 'full' | 'cutout'; label: string }

// ---- deterministic seeded RNG (stable per car) ----
function seedFrom(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Template {
  id: string
  name: string
  surfaceBg: string        // backdrop behind photo / when cutout
  band: boolean            // white masthead band across the top
  bandBg?: string
  mastColor: string        // masthead color
  accent: string
  textOnPhoto: 'light' | 'dark'  // bottom cover-lines color mode
  scrim: boolean           // dark gradient behind masthead (for light masthead over photo)
  vignette: boolean        // soft edge darkening (used to tame high-key covers)
  logo: boolean            // G logo top-right
  interior: string         // inside-theme label (prototype only)
}

const TEMPLATES: Template[] = [
  { id: 'top-band', name: 'Top Band', surfaceBg: 'linear-gradient(180deg,#17171a,#070708)', band: true, bandBg: '#f4f1ea',
    mastColor: '#0a0a0a', accent: COLOR_ACCENT, textOnPhoto: 'light', scrim: false, vignette: false, logo: true,
    interior: 'White pages · black ink · burnt-orange pops' },
  { id: 'burgundy', name: 'Burgundy Brand', surfaceBg: 'linear-gradient(180deg,#17171a,#070708)', band: true, bandBg: '#f4f1ea',
    mastColor: COLOR_BRAND, accent: COLOR_BRAND, textOnPhoto: 'light', scrim: false, vignette: false, logo: true,
    interior: 'Cream pages · burgundy headers' },
  { id: 'knockout-white', name: 'Knockout White', surfaceBg: 'radial-gradient(ellipse at 50% 30%,#15151a,#050506)', band: false,
    mastColor: '#ffffff', accent: COLOR_ACCENT, textOnPhoto: 'light', scrim: true, vignette: false, logo: false,
    interior: 'Black pages · white text · moody' },
  { id: 'ink-black', name: 'Ink Black', surfaceBg: 'linear-gradient(180deg,#e4ddcf 0%,#b9b1a1 100%)', band: false,
    mastColor: '#111', accent: COLOR_BRAND, textOnPhoto: 'dark', scrim: false, vignette: true, logo: false,
    interior: 'High-key white pages · black ink' },
]

export default function FeaturedPage() {
  const navigate = useNavigate()
  const [car, setCar] = useState<Car | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [photoIdx, setPhotoIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [idx, setIdx] = useState(0)
  const touchX = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!carId) { if (alive) setLoading(false); return }
      const { data } = await supabase
        .from('cars')
        .select('year, make, model, trim, nickname, horsepower, forced_induction, drivetrain, purchase_date, showcase_photo_url, garage_photo_url')
        .eq('id', carId).is('deleted_at', null).single()
      if (!alive) return
      const c = (data as unknown as Car) ?? null
      setCar(c)
      // Original upload — guarded: the column exists only after migration 049 runs,
      // so a missing column just yields no data (no crash) until then.
      const og = await supabase.from('cars').select('original_photo_url').eq('id', carId).single()
      if (!alive) return
      const originalUrl = (og.data as { original_photo_url?: string | null } | null)?.original_photo_url ?? null
      // Toggle ONLY between the original upload and the background-removed cutout.
      const cands: Photo[] = []
      if (originalUrl) cands.push({ url: originalUrl, mode: 'full', label: 'Original' })
      if (c?.garage_photo_url) cands.push({ url: c.garage_photo_url, mode: 'cutout', label: 'No BG' })
      setPhotos(cands)
      if (data) setIdx(seedFrom(carId) % TEMPLATES.length)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const seed = useMemo(() => seedFrom((car?.nickname ?? '') + (car?.year ?? '')), [car])
  const rng = useMemo(() => mulberry32(seed || 1), [seed])

  // ---- magazine furniture ----
  const purchaseYear = car?.purchase_date ? new Date(car.purchase_date).getFullYear() : null
  const thisYear = new Date().getFullYear()
  const vol = purchaseYear ? Math.max(1, thisYear - purchaseYear + 1) : 1
  const issue = useMemo(() => 1 + Math.floor(rng() * 12), [rng])
  const carName = [car?.year, car?.make, car?.model].filter(Boolean).join(' ') || 'YOUR BUILD'
  const headline = (car?.nickname || car?.model || 'YOUR BUILD').toString()
  const fi = car?.forced_induction && car.forced_induction !== 'none' ? car.forced_induction.replace('-', ' ') : null
  const powerLine = [
    car?.horsepower ? `${car.horsepower} HP` : null, fi,
    car?.drivetrain ? car.drivetrain.toUpperCase() : null,
  ].filter(Boolean).join(' · ')

  // ---- visible barcode: alternating black bars / light gaps, varied widths ----
  const bars = useMemo(() => {
    const r = mulberry32((seed || 1) ^ 0x9e3779b9)
    return Array.from({ length: 20 }, () => 2 + Math.floor(r() * 4))
  }, [seed])
  const barNum = useMemo(() => String(70000 + Math.floor(rng() * 29999)) + ' ' + String(10 + Math.floor(rng() * 89)), [rng])

  const t = TEMPLATES[idx]
  const photo = photos[photoIdx] ?? null
  const go = (dir: number) => setIdx((p) => (p + dir + TEMPLATES.length) % TEMPLATES.length)

  if (loading) return <div style={{ position: 'fixed', inset: 0, background: '#08080a' }} />
  const bottomColor = t.textOnPhoto === 'light' ? '#f5f5f5' : '#0a0a0a'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none' }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
    >
      <div key={t.id} style={{ position: 'absolute', inset: 0, animation: `featFade 360ms ${EASING_SETTLE} both` }}>
        {/* backdrop */}
        <div style={{ position: 'absolute', inset: 0, background: t.surfaceBg }} />

        {/* cover photo */}
        {photo ? (
          <img src={photo.url} alt=""
            style={{
              position: 'absolute',
              inset: photo.mode === 'cutout' ? 'auto 0 5% 0' : 0,
              width: '100%', height: photo.mode === 'cutout' ? '68%' : '100%',
              objectFit: photo.mode === 'cutout' ? 'contain' : 'cover', objectPosition: 'center',
            }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <span style={{ fontFamily: FONT_DECK, color: 'rgba(245,245,245,0.5)', letterSpacing: '0.3em', fontSize: 12, textTransform: 'uppercase' }}>
              Add a cover photo
            </span>
          </div>
        )}

        {/* vignette to tame high-key covers */}
        {t.vignette && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(20,16,10,0.32) 100%)' }} />
        )}

        {/* scrim behind light masthead */}
        {t.scrim && !t.band && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '34%',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.25) 55%, transparent 100%)' }} />
        )}

        {/* bottom scrim when text is light */}
        {t.textOnPhoto === 'light' && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '48%',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.35) 45%, transparent 100%)' }} />
        )}

        {/* ===== TOP: masthead ===== */}
        {t.band ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: t.bandBg, padding: '12px 16px 9px' }}>
            <Masthead t={t} size={40} />
            <TopStrip accent={t.accent} dark vol={vol} issue={issue} purchaseYear={purchaseYear} />
          </div>
        ) : (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '52px 16px 10px' }}>
            <Masthead t={t} size={46} />
            <TopStrip accent={t.accent} dark={false} vol={vol} issue={issue} purchaseYear={purchaseYear} />
          </div>
        )}

        {/* ===== BOTTOM: cover lines (lifted above the corner barcode) ===== */}
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 96 }}>
          <span style={{ display: 'inline-block', fontFamily: FONT_DECK, fontWeight: 600, fontSize: 11,
            letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff',
            background: t.accent, padding: '3px 8px', marginBottom: 10 }}>
            Feature Car
          </span>
          <div style={{ fontFamily: FONT_MASTHEAD, color: bottomColor, lineHeight: 0.92,
            fontSize: headline.length > 12 ? 44 : 58, textTransform: 'uppercase',
            textShadow: t.textOnPhoto === 'light' ? '0 2px 14px rgba(0,0,0,0.5)' : 'none' }}>
            {headline}
          </div>
          <div style={{ fontFamily: FONT_DECK, fontWeight: 500, color: bottomColor, opacity: 0.92,
            fontSize: 14, letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 8 }}>
            {carName}{car?.trim ? ` ${car.trim}` : ''}
          </div>
          {powerLine && (
            <div style={{ fontFamily: FONT_DECK, fontWeight: 600, color: t.accent,
              fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
              {powerLine}
            </div>
          )}
        </div>

        {/* ===== vertical barcode, bottom-left; numbers on the RIGHT side ===== */}
        <div style={{ position: 'absolute', left: 12, bottom: 16, background: '#f4f1ea', padding: '5px 6px',
          display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: 4, zIndex: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: 40 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ height: h, width: '100%', background: i % 2 ? '#f4f1ea' : '#0a0a0a' }} />
            ))}
          </div>
          <div style={{ writingMode: 'vertical-rl', fontFamily: FONT_DECK, fontSize: 7, letterSpacing: '0.12em', color: '#0a0a0a' }}>
            {barNum}
          </div>
        </div>

        {/* folio bottom-right */}
        <span style={{ position: 'absolute', right: 12, bottom: 12, fontFamily: FONT_DECK, fontWeight: 600,
          fontSize: 9, letterSpacing: '0.3em', color: bottomColor, opacity: 0.8 }}>
          GDIMENSION.APP
        </span>

        {/* glossy paper sheen */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(120% 60% at 75% 8%, rgba(255,255,255,0.16) 0%, transparent 42%)', mixBlendMode: 'screen' }} />
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03, mixBlendMode: 'screen',
          backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
      </div>

      {/* ===== chrome ===== */}
      <div onClick={() => navigate('/home')}
        style={{ position: 'absolute', top: 14, left: 12, zIndex: 20, fontFamily: FONT_DECK, fontSize: 30, lineHeight: 1,
          color: COLOR_ACCENT, cursor: 'pointer', textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>‹</div>

      <div style={{ position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center', zIndex: 20,
        fontFamily: FONT_DECK, fontWeight: 600, fontSize: 9, letterSpacing: '0.28em', textTransform: 'uppercase',
        color: 'rgba(245,245,245,0.55)', pointerEvents: 'none' }}>
        Cover {idx + 1}/{TEMPLATES.length} · {t.name}
      </div>

      {/* photo-source toggle (full image vs cutout vs other shots) */}
      {photos.length > 1 && (
        <div onClick={() => setPhotoIdx((p) => (p + 1) % photos.length)}
          style={{ position: 'absolute', top: 48, right: 12, zIndex: 20, fontFamily: FONT_DECK, fontWeight: 600,
            fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#f5f5f5',
            background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245,245,245,0.35)', padding: '5px 9px', cursor: 'pointer' }}>
          Photo ▸ {photo?.label ?? '—'}
        </div>
      )}

      <div onClick={() => go(-1)} style={{ position: 'absolute', top: '30%', bottom: '22%', left: 0, width: '26%', zIndex: 15 }} />
      <div onClick={() => go(1)} style={{ position: 'absolute', top: '30%', bottom: '22%', right: 0, width: '26%', zIndex: 15 }} />

      <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 20 }}>
        {TEMPLATES.map((tp, i) => (
          <div key={tp.id} onClick={() => setIdx(i)}
            style={{ width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
              background: i === idx ? COLOR_ACCENT : 'rgba(245,245,245,0.4)', transition: `all 200ms ${EASING_SETTLE}`, cursor: 'pointer' }} />
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', zIndex: 20,
        fontFamily: FONT_DECK, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(245,245,245,0.4)', pointerEvents: 'none' }}>
        inside: {t.interior}
      </div>

      <style>{`@keyframes featFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}

function Masthead({ t, size }: { t: Template; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <h1 style={{ fontFamily: FONT_MASTHEAD, color: t.mastColor, margin: 0, lineHeight: 0.82,
        fontSize: size, letterSpacing: '-0.01em', fontStyle: 'italic', transform: 'skewX(-6deg)',
        textShadow: t.band ? 'none' : '0 2px 16px rgba(0,0,0,0.55)' }}>
        G-DIMENSION
      </h1>
      {t.logo && <img src={gLogo} alt="" style={{ height: size * 0.82, width: 'auto', flexShrink: 0 }} />}
    </div>
  )
}

function TopStrip({ accent, dark, vol, issue, purchaseYear }:
  { accent: string; dark: boolean; vol: number; issue: number; purchaseYear: number | null }) {
  const col = dark ? '#0a0a0a' : '#f5f5f5'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      fontFamily: FONT_DECK, fontWeight: 600, fontSize: 9.5, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: col, textShadow: dark ? 'none' : '0 1px 6px rgba(0,0,0,0.6)' }}>
      <span style={{ color: accent }}>VOL.{vol} NO.{issue}</span>
      <span>· Your Build. Featured.</span>
      {purchaseYear && <span style={{ marginLeft: 'auto' }}>Since {purchaseYear}</span>}
    </div>
  )
}
