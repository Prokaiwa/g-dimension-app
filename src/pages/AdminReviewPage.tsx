// Route: /admin/review/:carId — look at what you are judging.
//
// Exists because hiding a build hides it from EVERYONE, the admin included
// (ADR-023 reused `is_public`, and no reader is exempt from that flag). Before
// this page the only way to see a hidden build was to dismiss the report, which
// republishes the content and tells the owner they were cleared, then hide it
// again and tell them they broke the rules. See ADR-029.
//
// Deliberately NOT a copy of the public pages. A moderator wants density: every
// photo on the car in one grid with the reported one ringed, and every piece of
// free text under it. Navigating a magazine spread to find one image is the
// wrong shape for this job, and it is why "make the public pages admin-visible"
// would have been the worse fix even if it were free.
//
// Read-only on purpose. Dismiss / hide / suspend stay in the queue, so there is
// exactly one place where moderation decisions are taken.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { reviewCar, REPORT_TARGET_LABEL, type CarReview, type ReviewPhoto } from '../lib/moderation'
import {
  GRADIENT_APP_BG, COLOR_HEADER_BLACK, COLOR_HEADER_TITLE, COLOR_ACCENT,
  COLOR_ERROR, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  SPACE_XS, SPACE_SM, SPACE_MD, SPACE_LG,
} from '../tokens'

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'
const SEVERE = new Set(['nudity', 'hate', 'violence', 'illegal'])

type Cell = ReviewPhoto & { source: string; reported: boolean }

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: FAINT, margin: `${SPACE_LG}px 0 ${SPACE_XS}px`,
    }}>{children}</p>
  )
}

function Prose({ title, body }: { title: string; body: string | null }) {
  if (!body?.trim()) return null
  return (
    <div style={{ marginBottom: SPACE_SM, borderLeft: `2px solid rgba(240,228,200,0.12)`, paddingLeft: SPACE_SM }}>
      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: MUTED, margin: '0 0 3px' }}>{title}</p>
      <p style={{
        fontFamily: FONT_UI, fontSize: 13, color: 'rgba(240,228,200,0.85)', margin: 0,
        lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }}>{body}</p>
    </div>
  )
}

export default function AdminReviewPage() {
  const { carId } = useParams<{ carId: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const reportId = params.get('report')

  const [data, setData]   = useState<CarReview | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!carId) return
    let alive = true
    reviewCar(carId, reportId).then(r => {
      if (!alive) return
      setData(r)
      setState(r ? 'ready' : 'error')
    })
    return () => { alive = false }
  }, [carId, reportId])

  const shell = (children: React.ReactNode) => (
    <div style={{
      minHeight: '100dvh', background: GRADIENT_APP_BG,
      paddingBottom: `calc(${SPACE_LG}px + env(safe-area-inset-bottom))`,
    }}>
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center',
        padding: `0 ${SPACE_MD}px`, gap: SPACE_SM, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate('/admin/reports')} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: COLOR_HEADER_TITLE,
          fontSize: 22, lineHeight: 1, padding: 0, WebkitTapHighlightColor: 'transparent',
        }}>‹</button>
        <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 19, color: COLOR_HEADER_TITLE }}>
          Review
        </span>
      </div>
      <div style={{ padding: SPACE_MD }}>{children}</div>
    </div>
  )

  if (state === 'loading') return shell(null)
  if (state === 'error' || !data) {
    return shell(
      <p style={{ fontFamily: FONT_UI, fontSize: 13, color: MUTED, marginTop: SPACE_LG, textAlign: 'center', lineHeight: 1.6 }}>
        Could not load this build.
        <br />
        <span style={{ fontSize: 11.5, color: FAINT }}>
          If migration 091 has not run yet, this page has nothing to call.
        </span>
      </p>,
    )
  }

  const c = data.car
  const name = [c.year, c.make, c.model].filter(Boolean).join(' ') || 'Unknown build'
  const hidden = !!c.moderation_hidden_at
  const focus = reportId ? data.reports.find(r => r.id === reportId) ?? null : null

  // One flat grid. A moderator is looking for an image, not for the section it
  // happens to live in, so the source is a caption rather than a heading.
  const cells: Cell[] = [
    ...[c.garage_photo_url, c.showcase_photo_url, c.original_photo_url, ...c.build_sheet_photos]
      .filter((u): u is string => !!u)
      .map((u, i) => ({ id: `car:${i}`, url: u, source: 'Car photo', reported: focus?.target_type === 'car' })),
    ...data.job_photos.map(p => ({
      ...p, source: p.job_title || 'Mod photo',
      reported: focus?.target_type === 'photo' && focus.target_id === p.id,
    })),
    ...data.timeline_entries.filter(e => e.url).map(e => ({
      id: `tl:${e.id}`, url: e.url as string, source: e.title || 'Timeline',
      reported: focus?.target_type === 'timeline_entry' && focus.target_id === e.id,
    })),
    ...data.entry_photos.map(p => ({
      ...p, source: 'Entry photo',
      reported: focus?.target_type === 'timeline_entry' && focus.target_id === p.entry_id,
    })),
    ...data.diy_photos.map(p => ({ ...p, source: 'DIY step', reported: false })),
  ]

  return shell(
    <>
      {/* Where this build stands right now */}
      <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, color: CREAM, margin: 0 }}>
        {c.nickname?.trim() || name}
      </p>
      <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: MUTED, margin: '3px 0 0' }}>
        @{c.username ?? 'unknown'}{c.nickname?.trim() ? ` · ${name}` : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginTop: SPACE_SM }}>
        {[
          hidden        ? { t: 'Hidden by moderation', c: COLOR_ERROR } : null,
          !hidden && c.is_public ? { t: 'Public', c: MUTED } : null,
          !hidden && !c.is_public ? { t: 'Private (owner’s choice)', c: MUTED } : null,
          c.suspended   ? { t: 'Owner suspended', c: COLOR_ERROR } : null,
          c.deleted_at  ? { t: 'Deleted', c: COLOR_ERROR } : null,
        ].filter(Boolean).map(b => (
          <span key={b!.t} style={{
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: b!.c, border: `1px solid ${b!.c}`,
            padding: '3px 6px', opacity: 0.85,
          }}>{b!.t}</span>
        ))}
      </div>

      {/* Why you are here */}
      {data.reports.length > 0 && (
        <>
          <Label>Reports on this build</Label>
          {data.reports.map(r => (
            <div key={r.id} style={{
              border: `1px solid ${r.id === reportId ? COLOR_ACCENT : 'rgba(240,228,200,0.10)'}`,
              padding: SPACE_SM, marginBottom: SPACE_XS,
              background: r.id === reportId ? 'rgba(200,102,26,0.07)' : 'transparent',
            }}>
              <p style={{ fontFamily: FONT_UI, fontSize: 12, margin: 0, color: SEVERE.has(r.reason) ? COLOR_ERROR : COLOR_ACCENT, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {r.reason}
                <span style={{ color: FAINT, fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>
                  {' · '}{REPORT_TARGET_LABEL[r.target_type] ?? r.target_type}
                  {r.status !== 'open' && ` · ${r.status}`}
                </span>
              </p>
              {r.details && (
                <p style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(240,228,200,0.72)', margin: '4px 0 0', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  “{r.details}”
                </p>
              )}
            </div>
          ))}
        </>
      )}

      {/* Every image on the car, in one place */}
      <Label>{cells.length} photo{cells.length === 1 ? '' : 's'}</Label>
      {cells.length === 0 ? (
        <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: MUTED, margin: 0 }}>No photos on this build.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
          {cells.map((p, i) => (
            <div key={`${p.id}-${i}`}>
              <div
                role="button" tabIndex={0}
                onClick={() => window.open(p.url, '_blank', 'noopener')}
                onKeyDown={e => { if (e.key === 'Enter') window.open(p.url, '_blank', 'noopener') }}
                style={{
                  position: 'relative', width: '100%', aspectRatio: '1',
                  background: '#0b0b0d', cursor: 'pointer', overflow: 'hidden',
                  outline: p.reported ? `2px solid ${COLOR_ACCENT}` : 'none',
                  outlineOffset: -2, WebkitTapHighlightColor: 'transparent',
                }}>
                <img
                  src={p.url} alt="" loading="lazy" decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                {p.reported && (
                  <span style={{
                    position: 'absolute', top: 0, left: 0, background: COLOR_ACCENT, color: '#fff5dc',
                    fontFamily: FONT_UI, fontWeight: 800, fontSize: 8, letterSpacing: '0.10em',
                    textTransform: 'uppercase', padding: '2px 5px',
                  }}>Reported</span>
                )}
              </div>
              <p style={{
                fontFamily: FONT_UI, fontSize: 9.5, color: FAINT, margin: '3px 0 0',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{p.source}</p>
            </div>
          ))}
        </div>
      )}

      {/* Every piece of free text a person wrote */}
      <Label>Written content</Label>
      <Prose title="Profile bio" body={c.bio} />
      <Prose title="Origin story" body={c.purchase_story} />
      {data.timeline_entries.map(e => (
        <Prose
          key={e.id}
          title={`${e.display_date} · ${e.title?.trim() || e.entry_type}`}
          body={e.journal_entry}
        />
      ))}
      {!c.bio?.trim() && !c.purchase_story?.trim() &&
       !data.timeline_entries.some(e => e.journal_entry?.trim()) && (
        <p style={{ fontFamily: FONT_UI, fontSize: 12.5, color: MUTED, margin: 0 }}>
          Nothing written on this build.
        </p>
      )}

      <p style={{
        fontFamily: FONT_UI, fontSize: 10.5, color: FAINT, lineHeight: 1.6,
        marginTop: SPACE_LG, textAlign: 'center',
      }}>
        Read-only. Dismiss, hide and suspend live in the report queue.
        <br />
        Opening this page is recorded against your account.
      </p>
    </>,
  )
}
