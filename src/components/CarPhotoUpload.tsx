import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  removeCarBackground,
  subscribeModelState,
  getModelStatus,
  getModelProgress,
} from '../lib/backgroundRemoval'
import {
  COLOR_ACCENT,
  COLOR_CAVITY_BG,
  COLOR_HEADER_TITLE,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
} from '../tokens'

type Props = {
  /** Existing garage photo URL, if the car already has one. */
  currentUrl?: string | null
  /** Called with the processed transparent PNG and the ORIGINAL file (for
   *  storage), or (null, null) if processing failed. */
  onChange: (blob: Blob | null, originalFile?: File | null) => void
}

// A dark spotlight backdrop that mirrors how the car reads in the carousel.
const SPOTLIGHT = 'radial-gradient(ellipse 100% 75% at 50% 42%, #3a3a3a 0%, #1f1f1f 55%, #0d0d0f 100%)'

// On a warm model the cut-out can finish in a few hundred ms — keep the
// "Removing the background" moment on screen for at least this long so it's a
// deliberate, visible beat every time (add and edit alike), never a flash.
const MIN_REMOVING_MS = 850

export default function CarPhotoUpload({ currentUrl, onChange }: Props) {
  const objectUrlRef = useRef<string | null>(null)
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  // Re-render when the model's download status / progress changes.
  useEffect(() => subscribeModelState(() => forceRender(n => n + 1)), [])
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setBusy(true)
    const startedAt = Date.now()
    try {
      const blob = await removeCarBackground(file)
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const url = URL.createObjectURL(blob)
      objectUrlRef.current = url
      setPreview(url)
      onChange(blob, file)
    } catch (err) {
      console.error('[CarPhotoUpload] processing failed:', err)
      const detail = err instanceof Error ? err.message : String(err)
      setError(`Could not process that photo (${detail})`)
      onChange(null, null)
    } finally {
      // Hold the overlay to a minimum so a warm-model cut-out doesn't just blink.
      const elapsed = Date.now() - startedAt
      if (elapsed < MIN_REMOVING_MS) await new Promise(r => setTimeout(r, MIN_REMOVING_MS - elapsed))
      setBusy(false)
    }
  }

  const downloadingModel = busy && getModelStatus() === 'loading'
  const processing = busy && !downloadingModel

  return (
    <>
      <label
        style={{
          position: 'relative',
          width: '100%',
          height: 172,
          overflow: 'hidden',
          cursor: busy ? 'default' : 'pointer',
          background: preview ? SPOTLIGHT : 'rgba(255,255,255,0.02)',
          border: preview
            ? '1px solid rgba(245,240,228,0.10)'
            : '1px dashed rgba(245,240,228,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Your car"
              style={{
                maxWidth: '92%',
                maxHeight: '88%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <span
              style={{
                position: 'absolute',
                bottom: SPACE_SM,
                right: SPACE_SM,
                background: 'rgba(5,5,7,0.82)',
                color: COLOR_HEADER_TITLE,
                fontFamily: FONT_UI,
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '5px 10px',
                borderRadius: 9999,
              }}
            >
              Replace
            </span>
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: SPACE_XS,
              padding: SPACE_MD,
              textAlign: 'center',
            }}
          >
            <span style={{ color: COLOR_ACCENT, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>+</span>
            <span
              style={{
                fontFamily: FONT_UI,
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: '0.06em',
                color: 'rgba(245,240,228,0.78)',
              }}
            >
              Add a photo of your car
            </span>
            <span
              style={{
                fontFamily: FONT_UI,
                fontWeight: 500,
                fontSize: 11,
                color: COLOR_TEXT_SECONDARY,
                lineHeight: 1.5,
                maxWidth: 220,
              }}
            >
              A front three-quarter angle works best. The background is removed automatically.
            </span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={busy}
          style={{ display: 'none' }}
        />
      </label>

      {error && (
        <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', margin: `${SPACE_XS}px 0 0` }}>
          {error}
        </p>
      )}

      {/* Portalled to <body>: the upload lives inside transformed modal/carousel
          containers, and a transformed ancestor becomes the containing block for
          position:fixed — which would trap this overlay inside the modal box
          instead of covering the screen. The portal keeps it viewport-anchored. */}
      {downloadingModel && createPortal(
        <StudioOverlay
          title="Preparing your garage"
          subtitle="Setting up the background remover. This happens once — it'll be instant every time after."
          progress={getModelProgress()}
        />,
        document.body,
      )}
      {processing && createPortal(
        <StudioOverlay
          title="Removing the background"
          subtitle="Cutting your car cleanly out of the photo…"
        />,
        document.body,
      )}
    </>
  )
}

// Full-screen branded loading moment, shown over the whole flow.
function StudioOverlay({
  title,
  subtitle,
  progress,
}: {
  title: string
  subtitle: string
  progress?: number
}) {
  const indeterminate = progress === undefined
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: COLOR_CAVITY_BG,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 36px',
        textAlign: 'center',
      }}
    >
      <style>{`
        @keyframes studioBarPulse { 0%,100%{opacity:0.45} 50%{opacity:1} }
        @keyframes studioBarSlide { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }
      `}</style>

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 70% 48% at 50% 46%, rgba(200,102,26,0.14) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <p
        style={{
          fontFamily: FONT_TITLE,
          fontStyle: 'italic',
          fontWeight: 600,
          fontSize: 26,
          color: COLOR_HEADER_TITLE,
          margin: `0 0 ${SPACE_SM}px`,
          lineHeight: 1.2,
          position: 'relative',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontFamily: FONT_UI,
          fontWeight: 500,
          fontSize: 13,
          color: 'rgba(245,245,245,0.5)',
          lineHeight: 1.6,
          margin: `0 0 ${SPACE_MD}px`,
          maxWidth: 300,
          position: 'relative',
        }}
      >
        {subtitle}
      </p>

      <div
        style={{
          position: 'relative',
          width: 'min(280px, 76vw)',
          height: 3,
          background: 'rgba(255,255,255,0.09)',
          overflow: 'hidden',
        }}
      >
        {indeterminate ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '34%',
              background: COLOR_ACCENT,
              animation: 'studioBarSlide 1.15s ease-in-out infinite',
            }}
          />
        ) : (
          <div
            style={{
              height: '100%',
              width: `${Math.max(4, progress)}%`,
              background: COLOR_ACCENT,
              transition: 'width 280ms ease-out',
            }}
          />
        )}
      </div>

      {!indeterminate && (
        <p
          style={{
            fontFamily: FONT_UI,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: COLOR_ACCENT,
            margin: `${SPACE_SM}px 0 0`,
          }}
        >
          {progress}%
        </p>
      )}
    </div>
  )
}
