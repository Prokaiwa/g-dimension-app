// Route: /admin/store-shots — review the App Store / Play Store screenshot set
// on a real phone, at the size and in the ORDER a shopper meets them.
//
// The point of this page is the horizontal swipe. Judging store screenshots as
// a vertical list is misleading: the store presents them as a filmstrip, and
// the burgundy wedge in this set is designed to travel across the panels, so a
// panel out of step is only visible when they sit edge to edge. The strip below
// scroll-snaps one panel at a time to reproduce that.
//
// Images are WebP previews from public/store-shots/, built by
// scripts/build-store-shot-previews.mjs. The upload-quality 1290x2796 PNGs are
// deliberately NOT shipped in the app: they are ~1.5MB each and regenerable
// with scripts/render-all-panels.mjs. This page is for judging a layout, not
// for exporting the deliverable.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

type Panel = { n: string; title: string; line: string }

// Kept in step with design/store-shots/panel-0*.html. The headline is repeated
// here rather than read from the image so the list is scannable as text.
const PANELS: Panel[] = [
  { n: '01', title: 'Garage',     line: 'Your build has a story.' },
  { n: '02', title: 'Build Sheet', line: 'Every part. Every cost.' },
  { n: '03', title: 'Timeline',   line: 'It writes itself.' },
  { n: '04', title: 'Service',    line: 'A record buyers believe.' },
  { n: '05', title: 'Featured',   line: 'Your build, on a cover.' },
  { n: '06', title: 'Share',      line: 'One link. The whole story.' },
]

const src = (n: string) => `/store-shots/panel-${n}.webp`

export default function AdminStoreShotsPage() {
  const navigate = useNavigate()
  const [zoomed, setZoomed] = useState<Panel | null>(null)

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_XL}px + env(safe-area-inset-bottom))`,
    }}>
      {/* Header */}
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/admin')} aria-label="Back" style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Store Screenshots
        </span>
      </div>

      <div style={{ padding: `${SPACE_LG}px 0 0` }}>
        <p style={{
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: FAINT, margin: `0 ${SPACE_MD}px ${SPACE_XS}px`,
        }}>
          The set, in order
        </p>
        <p style={{
          fontFamily: FONT_UI, fontSize: 11.5, color: FAINT, lineHeight: 1.55,
          margin: `0 ${SPACE_MD}px ${SPACE_MD}px`,
        }}>
          Swipe sideways, the way the store presents them. The burgundy wedge is meant to
          travel across the six: shallow at the start, steepest around Service, easing off
          by the end. Tap any panel to fill the screen.
        </p>

        {/* The strip. scroll-snap so each swipe lands on exactly one panel. */}
        <div
          style={{
            display: 'flex', gap: SPACE_SM, overflowX: 'auto', scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch', padding: `0 ${SPACE_MD}px ${SPACE_SM}px`,
            scrollbarWidth: 'none',
          }}
        >
          {PANELS.map(p => (
            <div key={p.n} style={{ flexShrink: 0, scrollSnapAlign: 'center' }}>
              <button
                onClick={() => setZoomed(p)}
                aria-label={`${p.title}, panel ${p.n}`}
                style={{
                  display: 'block', padding: 0, border: '1px solid rgba(240,228,200,0.10)',
                  background: '#050507', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img
                  src={src(p.n)}
                  alt=""
                  style={{ display: 'block', width: 208, height: 'auto' }}
                />
              </button>
              <p style={{
                fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: CREAM,
                margin: `${SPACE_SM}px 0 0`, lineHeight: 1.2,
              }}>
                <span style={{ color: COLOR_ACCENT }}>{p.n}</span>&nbsp; {p.title}
              </p>
              <p style={{
                fontFamily: FONT_UI, fontSize: 11, color: MUTED, margin: '2px 0 0',
                lineHeight: 1.35, maxWidth: 208,
              }}>
                {p.line}
              </p>
            </div>
          ))}
        </div>

        {/* Facts worth having on the phone while judging the set. */}
        <p style={{
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px ${SPACE_MD}px ${SPACE_XS}px`,
        }}>
          Sizes
        </p>
        <div style={{ margin: `0 ${SPACE_MD}px` }}>
          {[
            ['Apple 6.9 inch', '1290 × 2796', 'What these are. Up to 10 allowed'],
            ['Play phone', '1080 × 1920', 'Needs its own layout: Play caps at 2:1, Apple is 2.17:1'],
            ['Play feature graphic', '1024 × 500', 'Required by Play, and easy to forget'],
          ].map(([label, size, note]) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'baseline', gap: SPACE_SM, padding: '11px 0',
              borderBottom: '1px solid rgba(240,228,200,0.07)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: CREAM, margin: 0 }}>{label}</p>
                <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '2px 0 0', lineHeight: 1.4 }}>{note}</p>
              </div>
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: COLOR_ACCENT, flexShrink: 0 }}>{size}</span>
            </div>
          ))}
        </div>

        <p style={{
          fontFamily: FONT_UI, fontSize: 11, color: FAINT, lineHeight: 1.6,
          margin: `${SPACE_XL}px ${SPACE_MD}px 0`, textAlign: 'center',
        }}>
          Previews only. The upload-quality PNGs are built locally with
          <br />
          <code>node scripts/render-all-panels.mjs</code>
        </p>
      </div>

      {/* Full-screen view. Tap anywhere to dismiss. */}
      {zoomed && (
        <div
          role="button" tabIndex={0}
          onClick={() => setZoomed(null)}
          onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setZoomed(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: '#050507',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <img
            src={src(zoomed.n)}
            alt=""
            style={{ maxWidth: '100%', maxHeight: '86dvh', objectFit: 'contain', display: 'block' }}
          />
          <p style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: MUTED,
            margin: `${SPACE_MD}px 0 0`, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {zoomed.n} &nbsp;{zoomed.title} &nbsp;·&nbsp; tap to close
          </p>
        </div>
      )}
    </div>
  )
}
