// Full-screen image viewer — tap anywhere (or the ✕) to dismiss.
// Used by the DIY guide pages (owner + public) to zoom a step photo.
import { FONT_UI } from '../tokens'

export default function ImageLightbox({
  src, caption, onClose,
}: { src: string; caption?: string | null; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: 'none',
          color: '#f5f5f5', fontSize: 22, lineHeight: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
      >×</button>
      <img
        src={src}
        alt={caption ?? ''}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: caption ? '82vh' : '90vh',
          objectFit: 'contain', display: 'block',
        }}
      />
      {caption && (
        <p style={{
          fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,245,245,0.85)',
          textAlign: 'center', margin: '14px 8px 0', lineHeight: 1.5, maxWidth: 600,
        }}>{caption}</p>
      )}
    </div>
  )
}
