// Route: /discover — the first way to FIND anything in this app (092, ADR-030).
//
// Public on purpose: the /builds/* pages are readable signed out, so the way in
// has to be too. Signing in is for following, not for looking.
//
// Shape of the screen:
//   empty query → what is actually in here. Model chips built from real cars,
//                 and the builds worked on most recently. A search box over a
//                 blank page is a dead end, and a fake "trending" list would be
//                 a lie at this size.
//   2+ chars    → live results, people first, then builds.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  searchPublic, getDiscoverHome, hitHref, buildCountLabel, MIN_QUERY, EMPTY_HOME,
  type SearchHit, type DiscoverHome, type DiscoverBuild,
} from '../lib/discover'
import { flagEmoji } from '../lib/countries'
import garagePlaceholder from '../assets/garage_placeholder.webp'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE,
  FONT_UI, FONT_TITLE, HEADER_HEIGHT, SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'
const HAIR  = '1px solid rgba(240,228,200,0.07)'

// Long enough that a fast typist issues one request per word rather than per
// letter, short enough that it still feels like it is keeping up.
const DEBOUNCE_MS = 180

function Avatar({ url, name, size = 38 }: { url: string | null; name: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(240,228,200,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_UI, fontWeight: 800, fontSize: size * 0.4, color: MUTED,
    }}>{(name || '?').charAt(0).toUpperCase()}</div>
  )
}

function Thumb({ url, size = 46 }: { url: string | null; size?: number }) {
  return (
    <div style={{
      width: size * 1.35, height: size, flexShrink: 0, overflow: 'hidden',
      background: 'radial-gradient(ellipse 90% 70% at 50% 55%, #272420 0%, #141210 55%, #0b0b0d 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <img
        src={url || garagePlaceholder} alt="" loading="lazy" decoding="async"
        style={{
          width: '100%', height: '100%', objectFit: 'contain', display: 'block',
          filter: url ? undefined : 'brightness(0.16)',
        }}
      />
    </div>
  )
}

function Row({ onGo, children }: { onGo: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={onGo}
      onKeyDown={e => { if (e.key === 'Enter') onGo() }}
      style={{
        display: 'flex', alignItems: 'center', gap: SPACE_SM,
        padding: `${SPACE_SM}px 0`, borderBottom: HAIR,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >{children}</div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: FAINT, margin: `${SPACE_LG}px 0 ${SPACE_XS}px`,
    }}>{children}</p>
  )
}

function place(city: string | null, cc: string | null): string {
  return [city, cc ? flagEmoji(cc) : null].filter(Boolean).join(' ')
}

export default function DiscoverPage() {
  const navigate = useNavigate()
  const [q, setQ]           = useState('')
  const [hits, setHits]     = useState<SearchHit[] | null>(null)
  const [home, setHome]     = useState<DiscoverHome | null>(null)
  const [busy, setBusy]     = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)
  // Every request carries a sequence number. Responses can land out of order —
  // "s2" resolving after "s2000" would otherwise overwrite the better results
  // with staler ones, which reads as the list flickering backwards.
  const seq                 = useRef(0)

  useEffect(() => { getDiscoverHome().then(setHome) }, [])

  useEffect(() => {
    const t = q.trim()
    if (t.length < MIN_QUERY) { setHits(null); setBusy(false); return }
    setBusy(true)
    const mine = ++seq.current
    const timer = window.setTimeout(async () => {
      const r = await searchPublic(t)
      if (mine !== seq.current) return
      setHits(r)
      setBusy(false)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [q])

  const goHit = useCallback((h: SearchHit) => {
    const href = hitHref(h)
    if (href) navigate(href)
  }, [navigate])

  const goBuild = useCallback((b: DiscoverBuild) => {
    if (b.username) navigate(`/builds/${b.username}?car=${b.car_id}`)
  }, [navigate])

  const searching = q.trim().length >= MIN_QUERY
  const people = (hits ?? []).filter(h => h.kind === 'person')
  const builds = (hits ?? []).filter(h => h.kind === 'build')
  const h = home ?? EMPTY_HOME

  return (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 11,
      }}>
        <button onClick={() => navigate(-1)} aria-label="Back" style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Discover
        </span>
      </div>

      {/* The field stays put while results scroll under it. */}
      <div style={{
        position: 'sticky', top: HEADER_HEIGHT, zIndex: 10,
        background: 'rgba(10,10,12,0.94)', backdropFilter: 'blur(8px)',
        padding: `${SPACE_SM}px ${SPACE_MD}px`, borderBottom: HAIR,
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden
               style={{ position: 'absolute', left: 11, pointerEvents: 'none' }}>
            <circle cx="7" cy="7" r="5" stroke={FAINT} strokeWidth="1.6" />
            <path d="M11 11L14.5 14.5" stroke={FAINT} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="A handle, or a car. Try S2000"
            autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
            enterKeyHint="search"
            style={{
              width: '100%', minHeight: 44, borderRadius: 0,
              background: 'rgba(240,228,200,0.06)', border: '1px solid rgba(240,228,200,0.12)',
              padding: `0 ${q ? 38 : 12}px 0 32px`, color: CREAM,
              fontFamily: FONT_UI, fontSize: 15, outline: 'none',
            }}
          />
          {q && (
            <button
              onClick={() => { setQ(''); inputRef.current?.focus() }}
              aria-label="Clear"
              style={{
                position: 'absolute', right: 0, width: 38, height: 44, background: 'none',
                border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, lineHeight: 1,
                WebkitTapHighlightColor: 'transparent',
              }}>×</button>
          )}
        </div>
      </div>

      <div style={{ padding: `0 ${SPACE_MD}px` }}>

        {/* ── Landing: what is actually in here ── */}
        {!searching && (
          <>
            {h.total > 0 && (
              <p style={{ fontFamily: FONT_UI, fontSize: 12, color: MUTED, margin: `${SPACE_MD}px 0 0` }}>
                {h.total} public build{h.total === 1 ? '' : 's'} from {h.people} owner{h.people === 1 ? '' : 's'}.
              </p>
            )}

            {h.models.length > 0 && (
              <>
                <SectionLabel>What people are building</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {h.models.map(m => (
                    <button
                      key={m.label}
                      onClick={() => { setQ(m.label); inputRef.current?.focus() }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 32,
                        padding: '0 10px', cursor: 'pointer', borderRadius: 0,
                        background: 'rgba(240,228,200,0.05)', border: '1px solid rgba(240,228,200,0.12)',
                        fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: 'rgba(240,228,200,0.82)',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      {m.label}
                      <span style={{ fontWeight: 800, fontSize: 10, color: FAINT }}>{m.n}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {h.recent.length > 0 && (
              <>
                <SectionLabel>Worked on lately</SectionLabel>
                {h.recent.map(b => (
                  <Row key={b.car_id} onGo={() => goBuild(b)}>
                    <Thumb url={b.photo_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.nickname?.trim() || b.label}
                      </p>
                      <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.nickname?.trim() ? `${b.label} · ` : ''}@{b.username}
                      </p>
                    </div>
                    <span style={{ flexShrink: 0, color: FAINT, fontSize: 18, lineHeight: 1 }}>›</span>
                  </Row>
                ))}
              </>
            )}

            {home !== null && h.total === 0 && (
              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.7 }}>
                Nothing to discover yet.
                <br />
                <span style={{ fontSize: 12 }}>Public builds show up here as people share them.</span>
              </p>
            )}
          </>
        )}

        {/* ── Results ── */}
        {searching && (
          <>
            {people.length > 0 && (
              <>
                <SectionLabel>People</SectionLabel>
                {people.map(p => (
                  <Row key={`p-${p.user_id}`} onGo={() => goHit(p)}>
                    <Avatar url={p.avatar_url} name={p.display_name || p.username} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.display_name || `@${p.username}`}
                      </p>
                      <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{p.username} · {buildCountLabel(p.build_count)}
                        {place(p.city, p.country_code) ? ` · ${place(p.city, p.country_code)}` : ''}
                      </p>
                    </div>
                    <span style={{ flexShrink: 0, color: FAINT, fontSize: 18, lineHeight: 1 }}>›</span>
                  </Row>
                ))}
              </>
            )}

            {builds.length > 0 && (
              <>
                <SectionLabel>Builds</SectionLabel>
                {builds.map(b => (
                  <Row key={`b-${b.car_id}`} onGo={() => goHit(b)}>
                    <Thumb url={b.photo_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.nickname?.trim() || b.car_label}
                      </p>
                      <p style={{ fontFamily: FONT_UI, fontSize: 11.5, color: MUTED, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.nickname?.trim() ? `${b.car_label} · ` : ''}@{b.username}
                      </p>
                    </div>
                    <span style={{ flexShrink: 0, color: FAINT, fontSize: 18, lineHeight: 1 }}>›</span>
                  </Row>
                ))}
              </>
            )}

            {/* Only after the request settles — saying "no builds" while one is
                in flight is wrong more often than it is right. */}
            {hits !== null && !busy && hits.length === 0 && (
              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.7 }}>
                Nothing matches “{q.trim()}”.
                <br />
                <span style={{ fontSize: 12, color: FAINT }}>
                  Try a make, a model, or someone's handle.
                </span>
              </p>
            )}
          </>
        )}

        {searching && busy && hits === null && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: FAINT, marginTop: SPACE_MD }}>Searching…</p>
        )}
      </div>
    </div>
  )
}
