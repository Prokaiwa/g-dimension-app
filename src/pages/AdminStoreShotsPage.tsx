// Route: /admin/store-shots — review the App Store / Play Store screenshot set
// on a real phone, at the size and in the ORDER a shopper meets them.
//
// The point of this page is the horizontal swipe. Judging store screenshots as
// a vertical list is misleading: the store presents them as a filmstrip, and
// the burgundy wedge in this set is designed to travel across the panels, so a
// panel out of step is only visible when they sit edge to edge. The strip below
// scroll-snaps one panel at a time to reproduce that.
//
// Images are WebP previews built by scripts/build-store-shot-previews.mjs. The
// upload-quality 1290x2796 PNGs are deliberately NOT shipped in the app: they
// are ~1.5MB each and regenerable with scripts/render-all-panels.mjs. This page
// is for judging a layout, not for exporting the deliverable.
//
// They are IMPORTED from src/assets rather than served from public/ so Vite
// content-hashes the filenames. This is load-bearing, not tidiness: the service
// worker runtime-caches every same-origin image CacheFirst for 60 days
// (vite.config.ts), which is correct only for URLs that never change meaning.
// From public/ these previews kept the same path across renders, so a re-render
// was invisible to anyone who had already opened the page — no amount of
// refreshing helped. Hashed filenames make each render a new URL, so the cache
// misses and self-heals.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import panel01 from '../assets/store-shots/panel-01.webp'
import panel02 from '../assets/store-shots/panel-02.webp'
import panel03 from '../assets/store-shots/panel-03.webp'
import panel04 from '../assets/store-shots/panel-04.webp'
import panel05 from '../assets/store-shots/panel-05.webp'
import panel06 from '../assets/store-shots/panel-06.webp'
import panel07 from '../assets/store-shots/panel-07.webp'
import play01 from '../assets/store-shots/play-01.webp'
import play02 from '../assets/store-shots/play-02.webp'
import play03 from '../assets/store-shots/play-03.webp'
import play04 from '../assets/store-shots/play-04.webp'
import play05 from '../assets/store-shots/play-05.webp'
import play06 from '../assets/store-shots/play-06.webp'
import play07 from '../assets/store-shots/play-07.webp'
import featureGraphic from '../assets/store-shots/feature-graphic.webp'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG, SPACE_XL,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

type Panel = { n: string; title: string; line: string }
type Zoomed = Panel & { src: string }

// Kept in step with design/store-shots/panel-0*.html. The headline is repeated
// here rather than read from the image so the list is scannable as text.
const PANELS: Panel[] = [
  { n: '01', title: 'Garage',      line: 'Your build has a story.' },
  { n: '02', title: 'Build Sheet', line: 'Show the whole build.' },
  // Service sits ahead of the Timeline on purpose: this is a service tracker
  // first, so the record should land before the storytelling.
  { n: '03', title: 'Service',     line: 'Every service, logged.' },
  { n: '04', title: 'Timeline',    line: 'Your build, chronicled.' },
  { n: '05', title: 'Sell',        line: 'The record goes with it.' },
  { n: '06', title: 'Featured',    line: 'Your build, on a cover.' },
  { n: '07', title: 'Community',   line: 'Your car. Your world.' },
]

const APPLE: Record<string, string> = {
  '01': panel01, '02': panel02, '03': panel03, '04': panel04,
  '05': panel05, '06': panel06, '07': panel07,
}
// Play is a re-LAYOUT, not a resize: 1080x1920 is 1.78:1 against Apple's
// 2.17:1, so a scaled Apple panel loses its bottom fifth — which on this set is
// where the payload lives (the info strip, the running total, the transfer row,
// the Featured node). Worth being able to compare the two side by side here.
const PLAY: Record<string, string> = {
  '01': play01, '02': play02, '03': play03, '04': play04,
  '05': play05, '06': play06, '07': play07,
}

function Strip({ set, onZoom }: { set: Record<string, string>; onZoom: (z: Zoomed) => void }) {
  return (
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
            onClick={() => onZoom({ ...p, src: set[p.n] })}
            aria-label={`${p.title}, panel ${p.n}`}
            style={{
              display: 'block', padding: 0, border: '1px solid rgba(240,228,200,0.10)',
              background: '#050507', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <img src={set[p.n]} alt="" style={{ display: 'block', width: 208, height: 'auto' }} />
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
  )
}

const label: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
  textTransform: 'uppercase', color: FAINT,
}

export default function AdminStoreShotsPage() {
  const navigate = useNavigate()
  const [zoomed, setZoomed] = useState<Zoomed | null>(null)

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
        <p style={{ ...label, margin: `0 ${SPACE_MD}px ${SPACE_XS}px` }}>App Store · 1290 × 2796</p>
        <p style={{
          fontFamily: FONT_UI, fontSize: 11.5, color: FAINT, lineHeight: 1.55,
          margin: `0 ${SPACE_MD}px ${SPACE_MD}px`,
        }}>
          Swipe sideways, the way the store presents them. Tap any panel to fill the screen.
        </p>
        <Strip set={APPLE} onZoom={setZoomed} />

        <p style={{ ...label, margin: `${SPACE_XL}px ${SPACE_MD}px ${SPACE_XS}px` }}>Play Store · 1080 × 1920</p>
        <p style={{
          fontFamily: FONT_UI, fontSize: 11.5, color: FAINT, lineHeight: 1.55,
          margin: `0 ${SPACE_MD}px ${SPACE_MD}px`,
        }}>
          A re-layout, not a resize. Play is 1.78:1 against Apple’s 2.17:1, so a scaled
          Apple panel would lose its bottom fifth — which is where the info strip, the
          running total, the transfer row and the Featured node all live.
        </p>
        <Strip set={PLAY} onZoom={setZoomed} />

        <p style={{ ...label, margin: `${SPACE_XL}px ${SPACE_MD}px ${SPACE_XS}px` }}>Feature graphic · 1024 × 500</p>
        <p style={{
          fontFamily: FONT_UI, fontSize: 11.5, color: FAINT, lineHeight: 1.55,
          margin: `0 ${SPACE_MD}px ${SPACE_MD}px`,
        }}>
          Required by Play and the most-seen asset on the listing. Not a screenshot: at
          500px tall a portrait screen would be a postage stamp, and Play re-crops this
          for different placements, so everything that matters sits well inside.
        </p>
        <div style={{ padding: `0 ${SPACE_MD}px` }}>
          <button
            onClick={() => setZoomed({ n: 'FG', title: 'Feature graphic', line: '', src: featureGraphic })}
            style={{
              display: 'block', width: '100%', padding: 0, border: '1px solid rgba(240,228,200,0.10)',
              background: '#050507', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <img src={featureGraphic} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
          </button>
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
            src={zoomed.src}
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
