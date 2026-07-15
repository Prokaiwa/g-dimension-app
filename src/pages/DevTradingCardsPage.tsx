// Route: /dev/trading-cards — dev tool, like /sound-test. Internal, unlinked
// generator for physical print-ready trading cards (front + back PNGs) of any
// PUBLIC car, sized for makeplayingcards.com's 2.48in × 3.46in custom card
// with 0.12in bleed per side. Reads only public_car_profiles (the same data
// boundary as /builds/:username) and exports entirely client-side.
//
// Export engine: html-to-image toCanvas (SVG foreignObject — the browser
// paints the snapshot), dynamically imported, exactly like storyShare.ts.
// NOT html2canvas — see storyShare.ts's header for the documented failure.
// Output is PNG (print job: sharp type/logo/QR edges), unlike storyShare's
// Instagram JPEG.
//
// Pixel math: the card DOM renders at a fixed 150 "base DPI" CSS size
// (2.72in × 3.70in bleed-included → 408 × 555 px, which also ≈ the real
// carousel card width, so the carousel's exact font sizes drop in unscaled).
// Export pixelRatio = DPI / 150, so 300 DPI → 816×1110, 600 → 1632×2220,
// 900 → 2448×3330.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadFile } from '../lib/storyShare'
import GarageStageBackdrop, { GARAGE_STAGE_BASE_BG } from '../components/GarageStageBackdrop'
import gBadge from '../assets/logo/gdimensionG.webp'
import {
  GRADIENT_APP_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_ACCENT,
  COLOR_ACCENT_TEXT,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  RADIUS_BUTTON,
} from '../tokens'

// ── Physical spec (makeplayingcards.com custom size) ──────────────────────
// Trim 2.48in × 3.46in + 0.12in bleed per side = 2.72in × 3.70in exported.
const TRIM_IN = { w: 2.48, h: 3.46 }
const BLEED_IN = 0.12
const FULL_IN = { w: TRIM_IN.w + 2 * BLEED_IN, h: TRIM_IN.h + 2 * BLEED_IN } // 2.72 × 3.70
const SAFE_IN = 0.1 // extra inset from the trim line for text/logo/QR

// The DOM renders at this base DPI; export scales it up via pixelRatio.
const BASE_DPI = 150
const CARD_W = FULL_IN.w * BASE_DPI // 408
const CARD_H = FULL_IN.h * BASE_DPI // 555
const BLEED_PX = BLEED_IN * BASE_DPI // 18 — trim line inset
const SAFE_PX = (BLEED_IN + SAFE_IN) * BASE_DPI // 33 — keep all content inside
// Boxed content (top bar, info strip, QR) sits a touch further in than the
// safe line so nothing kisses the dashed guide — safer against cut drift and
// more composed.
const CONTENT_PAD = SAFE_PX + 8 // 41

const DPI_PRESETS = [300, 600, 900] as const

type PublicCar = {
  id: string
  username: string
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  trim: string | null
  color: string | null
  garage_photo_url: string | null
}

const publicCarUrl = (car: PublicCar) =>
  `https://gdimension.app/builds/${car.username}/garage?car=${car.id}`

// ── Card faces ─────────────────────────────────────────────────────────────

// Front: the carousel card, lifted — GT stage, logo + model top bar, cutout on
// the floor, info rows, vertical @handle, QR to the car's public page.
function CardFront({ car, qrDataUrl }: { car: PublicCar; qrDataUrl: string | null }) {
  return (
    <div style={{ width: CARD_W, height: CARD_H, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: GARAGE_STAGE_BASE_BG, fontFamily: FONT_UI }}>

      {/* Top bar — logo + model (carousel top-bar styling, inset to the safe zone) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${CONTENT_PAD}px ${CONTENT_PAD + 12}px ${SPACE_XS}px ${CONTENT_PAD}px`, flexShrink: 0, position: 'relative', zIndex: 2 }}>
        <img
          src={`/manufacturer_logos/${(car.make ?? '').toLowerCase().replace(/\s+/g, '-')}.png`}
          alt={car.make ?? ''}
          style={{ height: 44, width: 'auto', maxWidth: '50%', objectFit: 'contain', mixBlendMode: 'screen', flexShrink: 0 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
        />
        {/* nowrap so "LS 430" stays on one line — wide wordmark logos (Lexus)
            otherwise leave just enough room that flex wraps it at the space. */}
        <span style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 33, color: 'rgba(245,240,228,0.95)', letterSpacing: '-0.03em', lineHeight: 1, whiteSpace: 'nowrap', textAlign: 'right' }}>
          {[car.model, car.variant].filter(Boolean).join(' ')}
        </span>
      </div>

      {/* GT-style garage stage */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GarageStageBackdrop />
        {/* Car — sits just above the floor line, same geometry as the carousel.
            Narrower than the carousel's 88% (card is portrait, not a phone
            viewport) so it clears the safe zone on both sides and doesn't crowd
            the model text / QR on the right. */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '27%', zIndex: 2 }}>
          <div style={{ position: 'relative', width: '80%' }}>
            {car.garage_photo_url && (
              <img
                src={car.garage_photo_url}
                crossOrigin="anonymous"
                alt=""
                style={{ width: '100%', maxHeight: 200, objectFit: 'contain', objectPosition: 'bottom', display: 'block', filter: 'drop-shadow(0px 8px 14px rgba(0,0,0,0.92))' }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Info strip — carousel label/value styling; rows only when the field has a value */}
      <div style={{ flexShrink: 0, background: 'rgba(5,5,7,0.9)', position: 'relative', zIndex: 2, paddingBottom: CONTENT_PAD - 7 }}>
        {car.color && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `5px ${CONTENT_PAD}px`, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY, whiteSpace: 'nowrap' }}>{car.color}</span>
          </div>
        )}
        {(car.year != null || car.trim) && (
          <div style={{ display: 'flex', gap: SPACE_LG, alignItems: 'center', padding: `7px ${CONTENT_PAD}px`, borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
            {car.year != null && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Year</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.year}</span>
              </div>
            )}
            {car.trim && (
              <div style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY }}>Trim</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: 'rgba(245,240,228,0.9)' }}>{car.trim}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* @handle — down the left edge, reading top-to-bottom (no rotate → the
          book-spine direction), in the black below the logo so it sits off the
          car. Cormorant italic for the "fancy" feel. */}
      <span style={{ position: 'absolute', left: SAFE_PX, top: SAFE_PX + 84, writingMode: 'vertical-rl', fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, letterSpacing: '0.06em', color: 'rgba(245,240,228,0.85)', zIndex: 5 }}>
        @{car.username}
      </span>

      {/* QR — deep link to this car's public garage page */}
      {qrDataUrl && (
        <div style={{ position: 'absolute', right: CONTENT_PAD, bottom: CONTENT_PAD, zIndex: 6, background: '#ffffff', padding: 3 }}>
          <img src={qrDataUrl} alt="" style={{ width: 52, height: 52, display: 'block' }} />
        </div>
      )}
    </div>
  )
}

// Back: the StartSplash composition (badge + wordmark), static, on the
// login/signup radial (GRADIENT_APP_BG) — deliberately NOT the flat splash bg.
function CardBack() {
  return (
    // paddingBottom lifts the badge+wordmark group off dead-center (~12px up):
    // with the wordmark weighting the bottom, mathematical centering reads low.
    <div style={{ width: CARD_W, height: CARD_H, position: 'relative', overflow: 'hidden', background: GRADIENT_APP_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBottom: 24 }}>
      <img src={gBadge} alt="" style={{ width: 220, height: 'auto', display: 'block' }} />
      <span style={{ marginTop: 6, display: 'block', fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700, fontSize: 28, letterSpacing: '-0.085em', color: COLOR_TEXT_PRIMARY, whiteSpace: 'nowrap' }}>
        G-Dimension
      </span>
      {/* Quiet real-world CTA — the only wayfinding on a physical card. Kept
          generic (no username/car) so the whole deck can share one back file. */}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: SAFE_PX + 6, textAlign: 'center', whiteSpace: 'nowrap', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(245,240,228,0.4)' }}>
        gdimension.app
      </span>
    </div>
  )
}

// Trim + safe-zone guides. Rendered as a SIBLING of the captured card node
// (never inside it), so they are structurally impossible to bake into the PNG.
function GuideOverlay() {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
      <div style={{ position: 'absolute', inset: 0, border: '1px solid rgba(245,245,245,0.3)' }} />
      <div style={{ position: 'absolute', inset: BLEED_PX, border: `1px solid ${COLOR_ACCENT}` }} />
      <div style={{ position: 'absolute', inset: SAFE_PX, border: '1px dashed rgba(245,245,245,0.4)' }} />
    </div>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────

async function exportCardPng(node: HTMLElement, dpi: number, filename: string): Promise<{ w: number; h: number }> {
  // Fonts must be resolved before rasterizing or Hanken falls back.
  await document.fonts.ready
  const { toCanvas } = await import('html-to-image')

  const opts = { width: CARD_W, height: CARD_H, pixelRatio: dpi / BASE_DPI }

  // WebKit warm-up: Safari's first foreignObject rasterization can miss
  // late-inlined images/fonts. Render three times and keep the last.
  let canvas = await toCanvas(node, opts)
  canvas = await toCanvas(node, opts)
  canvas = await toCanvas(node, opts)

  try {
    canvas.getContext('2d')?.getImageData(0, 0, 1, 1)
  } catch {
    throw new Error('render tainted (a cross-origin resource slipped into the capture)')
  }

  // The print file must hit the exact pixel math (2.72in × 3.70in at the
  // chosen DPI). pixelRatio lands there already; resample only if a browser
  // rounds oddly.
  const targetW = Math.round(FULL_IN.w * dpi)
  const targetH = Math.round(FULL_IN.h * dpi)
  let out: HTMLCanvasElement = canvas
  if (canvas.width !== targetW || canvas.height !== targetH) {
    const fixed = document.createElement('canvas')
    fixed.width = targetW
    fixed.height = targetH
    const ctx = fixed.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(canvas, 0, 0, targetW, targetH)
    out = fixed
  }

  const blob: Blob = await new Promise((resolve, reject) =>
    out.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  downloadFile(new File([blob], filename, { type: 'image/png' }))
  return { w: out.width, h: out.height }
}

// ── Page ───────────────────────────────────────────────────────────────────

const MUTED = 'rgba(245,245,245,0.5)'
const FAINT = 'rgba(245,245,245,0.32)'

const inputStyle: CSSProperties = {
  flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: COLOR_TEXT_PRIMARY, fontFamily: FONT_UI, fontSize: 15, padding: '10px 12px', outline: 'none',
}

const buttonStyle: CSSProperties = {
  background: COLOR_ACCENT, color: COLOR_ACCENT_TEXT, border: 'none', borderRadius: RADIUS_BUTTON,
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
  padding: '10px 18px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
}

export default function DevTradingCardsPage() {
  const navigate = useNavigate()
  const [usernameInput, setUsernameInput] = useState('')
  const [cars, setCars] = useState<PublicCar[] | null>(null)
  const [searchedFor, setSearchedFor] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<PublicCar | null>(null)
  const [dpi, setDpi] = useState<number>(300)
  const [showGuides, setShowGuides] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'front' | 'back' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)

  const search = async () => {
    const username = usernameInput.trim()
    if (!username || searching) return
    setSearching(true)
    setSelected(null)
    setCars(null)
    setStatus(null)
    // Exact, case-sensitive match — the same public boundary /builds uses.
    const { data, error } = await supabase
      .from('public_car_profiles')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: true })
    setSearchedFor(username)
    setCars(error ? [] : ((data as PublicCar[] | null) ?? []))
    setSearching(false)
  }

  const reset = () => {
    setSelected(null)
    setCars(null)
    setSearchedFor(null)
    setUsernameInput('')
    setStatus(null)
  }

  // Fresh QR whenever the selected car changes. Modules stay pure
  // black-on-white for scan contrast — print data, not UI palette.
  useEffect(() => {
    if (!selected) { setQrDataUrl(null); return }
    let cancelled = false
    import('qrcode')
      .then(QRCode => QRCode.toDataURL(publicCarUrl(selected), { width: 512, margin: 1, color: { dark: '#000000', light: '#ffffff' } }))
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [selected])

  const doExport = async (face: 'front' | 'back') => {
    const node = face === 'front' ? frontRef.current : backRef.current
    if (!node || !selected || exporting) return
    setExporting(face)
    setStatus(null)
    try {
      const filename = `${selected.username}-${selected.id.slice(0, 8)}-${face}-${dpi}dpi.png`
      const { w, h } = await exportCardPng(node, dpi, filename)
      setStatus(`Exported ${filename} — ${w}×${h}px`)
    } catch (err) {
      setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(null)
    }
  }

  const labelStyle: CSSProperties = {
    fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 ${SPACE_SM}px`,
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', paddingLeft: 10, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <button onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Trading Cards</span>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${SPACE_LG}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))` }}>
        <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.6 }}>
          Print-ready trading cards for makeplayingcards.com — trim 2.48″ × 3.46″ with 0.12″ bleed per
          side. Public cars only (reads the same view as /builds). Exact, case-sensitive username.
        </p>

        {/* ── Lookup ── */}
        <p style={labelStyle}>Username</p>
        <div style={{ display: 'flex', gap: SPACE_SM }}>
          <input
            value={usernameInput}
            onChange={e => setUsernameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void search() }}
            placeholder="exact username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={inputStyle}
          />
          <button onClick={() => void search()} disabled={searching || !usernameInput.trim()} style={{ ...buttonStyle, opacity: searching || !usernameInput.trim() ? 0.5 : 1 }}>
            {searching ? 'Searching…' : 'Search'}
          </button>
          {(cars || selected) && (
            <button onClick={reset} style={{ ...buttonStyle, background: 'rgba(255,255,255,0.08)', color: COLOR_TEXT_PRIMARY }}>Clear</button>
          )}
        </div>

        {/* ── Car picker ── */}
        {cars && cars.length === 0 && (
          <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_MD }}>
            No public cars found for “{searchedFor}”. (Private profiles/cars don’t appear here.)
          </p>
        )}
        {cars && cars.length > 0 && (
          <>
            <p style={labelStyle}>Pick a car — @{searchedFor}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
              {cars.map(car => (
                <button key={car.id} onClick={() => { setSelected(car); setStatus(null) }} style={{
                  display: 'flex', alignItems: 'center', gap: SPACE_MD, textAlign: 'left',
                  background: selected?.id === car.id ? 'rgba(200,102,26,0.14)' : 'rgba(255,255,255,0.04)',
                  border: selected?.id === car.id ? `1px solid ${COLOR_ACCENT}` : '1px solid rgba(255,255,255,0.08)',
                  padding: SPACE_SM, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}>
                  <div style={{ width: 84, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: GARAGE_STAGE_BASE_BG }}>
                    {car.garage_photo_url
                      ? <img src={car.garage_photo_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <span style={{ fontFamily: FONT_UI, fontSize: 9, color: FAINT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>No photo</span>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: COLOR_TEXT_PRIMARY }}>
                      {[car.year, car.make, car.model, car.variant].filter(Boolean).join(' ')}
                    </div>
                    {!car.garage_photo_url && (
                      <div style={{ fontFamily: FONT_UI, fontSize: 11, color: COLOR_ACCENT, marginTop: 2 }}>No cutout photo — front card will have an empty stage</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Previews + export ── */}
        {selected && (
          <>
            <p style={labelStyle}>Export settings</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_MD, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 1 }}>
                {DPI_PRESETS.map(preset => (
                  <button key={preset} onClick={() => setDpi(preset)} style={{
                    ...buttonStyle, borderRadius: 0,
                    background: dpi === preset ? COLOR_ACCENT : 'rgba(255,255,255,0.08)',
                    color: dpi === preset ? COLOR_ACCENT_TEXT : MUTED,
                  }}>
                    {preset} DPI
                  </button>
                ))}
              </div>
              <span style={{ fontFamily: FONT_UI, fontSize: 12, color: MUTED }}>
                → {Math.round(FULL_IN.w * dpi)} × {Math.round(FULL_IN.h * dpi)} px
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT_UI, fontSize: 12, color: MUTED, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} />
                Trim + safe-zone guides (preview only)
              </label>
            </div>

            <p style={labelStyle}>Preview</p>
            <div style={{ display: 'flex', gap: SPACE_LG, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Front */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
                <div style={{ position: 'relative', width: CARD_W, height: CARD_H }}>
                  <div ref={frontRef}>
                    <CardFront car={selected} qrDataUrl={qrDataUrl} />
                  </div>
                  {showGuides && <GuideOverlay />}
                </div>
                <button onClick={() => void doExport('front')} disabled={!!exporting} style={{ ...buttonStyle, opacity: exporting ? 0.5 : 1 }}>
                  {exporting === 'front' ? 'Exporting…' : `Download Front PNG (${dpi} DPI)`}
                </button>
              </div>
              {/* Back */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
                <div style={{ position: 'relative', width: CARD_W, height: CARD_H }}>
                  <div ref={backRef}>
                    <CardBack />
                  </div>
                  {showGuides && <GuideOverlay />}
                </div>
                <button onClick={() => void doExport('back')} disabled={!!exporting} style={{ ...buttonStyle, opacity: exporting ? 0.5 : 1 }}>
                  {exporting === 'back' ? 'Exporting…' : `Download Back PNG (${dpi} DPI)`}
                </button>
              </div>
            </div>
            <p style={{ fontFamily: FONT_UI, fontSize: 11, color: FAINT, margin: `${SPACE_SM}px 0 0`, lineHeight: 1.6 }}>
              Solid amber line = trim (where the card is cut). Dashed line = safe zone — keep all
              text/logo/QR inside it. Guides are drawn outside the captured node and never export.
            </p>
            {status && (
              <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: status.startsWith('Export failed') ? COLOR_ACCENT : MUTED, marginTop: SPACE_MD }}>
                {status}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
