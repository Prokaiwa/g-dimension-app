// Route: /tuning/mod-group/:sessionId — Group detail for a titled modification session

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  FONT_UI, COLOR_ACCENT,
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M, HEADER_HEIGHT, EASING_SETTLE,
} from '../tokens'

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.3)',
}

const VALUE_STYLE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
  color: 'rgba(245,240,228,0.82)',
  marginTop: 3,
}

type ModSession = {
  id: string
  title: string | null
  category: string | null
  date_performed: string | null
  performed_by: 'self' | 'shop' | null
  shop_name: string | null
  total_cost: number | null
  notes: string | null
  add_to_timeline: boolean
}

type Component = {
  id: string
  title: string
  brand: string | null
  category: string | null
  parts_cost: number | null
  labor_cost: number | null
}

import React from 'react'

export default function TuningModGroupPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [session,    setSession]    = useState<ModSession | null>(null)
  const [components, setComponents] = useState<Component[]>([])
  const [loading,    setLoading]    = useState(true)
  const [pressedId,  setPressedId]  = useState<string | null>(null)

  // Delete confirmation
  const [deleteSheet,  setDeleteSheet]  = useState(false)
  const [deleting,     setDeleting]     = useState(false)

  useEffect(() => {
    if (!sessionId) return
    async function load() {
      const [{ data: sess }, { data: jobs }] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, title, category, date_performed, performed_by, shop_name, total_cost, notes, add_to_timeline')
          .eq('id', sessionId)
          .single(),
        supabase
          .from('jobs')
          .select('id, title, brand, category, parts_cost, labor_cost')
          .eq('session_id', sessionId)
          .eq('type', 'modification')
          .order('created_at', { ascending: true }),
      ])
      if (sess) setSession(sess as unknown as ModSession)
      setComponents((jobs ?? []) as Component[])
      setLoading(false)
    }
    load()
  }, [sessionId])

  function fmtDate(d: string | null) {
    if (!d) return '—'
    const [y, m, day] = d.split('-').map(Number)
    return `${MONTHS[m - 1]} ${day}, ${y}`
  }

  async function handleDelete() {
    if (!sessionId || deleting) return
    setDeleting(true)
    await supabase.from('sessions').delete().eq('id', sessionId)
    navigate('/tuning/build-sheet')
  }

  const totalCost = session?.total_cost

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0d0d0f', overflow: 'hidden', position: 'relative', fontFamily: FONT_UI }}>

      {/* ── Grain overlay ── */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 4, pointerEvents: 'none',
        backgroundImage: NOISE_SVG, backgroundSize: '220px 220px',
        opacity: 0.028, mixBlendMode: 'screen',
      }} />

      {/* ── Header ── */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 10, paddingRight: 14,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        position: 'relative', zIndex: 10,
      }}>
        <button onClick={() => navigate('/tuning/build-sheet')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent',
        }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
            color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>Build Sheet</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            background: 'rgba(242,238,228,0.94)', color: '#0d0d0d',
            padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>{MONTH_LABEL}</div>
          <div style={{
            background: COLOR_BURGUNDY_M, color: '#fff',
            padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: DAY_LABEL.length === 1 ? 24 : 30,
          }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      {!loading && session && (
        <div style={{
          flex: 1, overflowY: 'auto', position: 'relative', zIndex: 6,
          paddingBottom: 80,
          animation: `groupReveal 380ms ${EASING_SETTLE} both`,
        }}>
          <style>{`
            @keyframes groupReveal {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          {/* ── Group title ── */}
          <div style={{ padding: '28px 20px 0' }}>
            <p style={{
              fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700,
              fontSize: 28, color: 'rgba(245,240,228,0.92)',
              margin: 0, lineHeight: 1.15, letterSpacing: '-0.01em',
            }}>
              {session.title || 'Untitled Build'}
            </p>
            {session.category && (
              <p style={{
                fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: 'rgba(245,240,228,0.28)', margin: '6px 0 0',
              }}>
                {session.category.charAt(0).toUpperCase() + session.category.slice(1)}
              </p>
            )}
          </div>

          {/* ── Info rows ── */}
          <div style={{
            margin: '20px 20px 0',
            border: '1px solid rgba(245,240,228,0.06)',
          }}>
            {/* Date */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(245,240,228,0.05)' }}>
              <div style={LABEL_STYLE}>Date</div>
              <div style={VALUE_STYLE}>{fmtDate(session.date_performed)}</div>
            </div>

            {/* Performed by */}
            {session.performed_by && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(245,240,228,0.05)' }}>
                <div style={LABEL_STYLE}>Performed By</div>
                <div style={VALUE_STYLE}>
                  {session.performed_by === 'shop'
                    ? (session.shop_name ? `${session.shop_name} (Shop)` : 'Shop')
                    : 'Self'}
                </div>
              </div>
            )}

            {/* Total cost */}
            {totalCost != null && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(245,240,228,0.05)' }}>
                <div style={LABEL_STYLE}>Total Cost</div>
                <div style={{ ...VALUE_STYLE, color: 'rgba(245,240,228,0.9)' }}>
                  ${Number(totalCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}

            {/* Timeline badge */}
            {session.add_to_timeline && (
              <div style={{ padding: '10px 14px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  background: 'rgba(200,102,26,0.12)',
                  border: '1px solid rgba(200,102,26,0.35)',
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 9,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  color: 'rgba(200,102,26,0.75)',
                }}>
                  On Timeline
                </span>
              </div>
            )}
          </div>

          {/* ── Components ── */}
          <div style={{ margin: '28px 20px 0' }}>
            <div style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'rgba(245,240,228,0.25)', marginBottom: 10,
            }}>
              Components ({components.length})
            </div>

            {components.length === 0 ? (
              <p style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.25)', margin: 0, lineHeight: 1.6 }}>
                No components found.
              </p>
            ) : (
              <div style={{ border: '1px solid rgba(245,240,228,0.06)' }}>
                {components.map((comp, i) => (
                  <div
                    key={comp.id}
                    onClick={() => navigate(`/tuning/mods/${comp.id}`)}
                    onPointerDown={() => setPressedId(comp.id)}
                    onPointerUp={() => setPressedId(null)}
                    onPointerLeave={() => setPressedId(null)}
                    onPointerCancel={() => setPressedId(null)}
                    style={{
                      padding: '12px 14px',
                      borderBottom: i < components.length - 1 ? '1px solid rgba(245,240,228,0.05)' : 'none',
                      borderLeft: pressedId === comp.id
                        ? '2px solid rgba(200,102,26,0.7)'
                        : '2px solid transparent',
                      cursor: 'pointer',
                      opacity: pressedId === comp.id ? 0.6 : 1,
                      transition: 'opacity 80ms ease, border-left-color 80ms ease',
                      WebkitTapHighlightColor: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
                        color: 'rgba(180,192,205,0.88)', lineHeight: 1.3,
                      }}>
                        {comp.title}
                      </div>
                      <div style={{
                        fontFamily: FONT_UI, fontSize: 11,
                        color: 'rgba(245,240,228,0.28)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {[comp.brand, comp.category].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {(comp.parts_cost != null || comp.labor_cost != null) && (
                      <div style={{
                        fontFamily: FONT_UI, fontWeight: 600, fontSize: 12,
                        color: 'rgba(245,240,228,0.45)',
                        marginLeft: 12, flexShrink: 0,
                      }}>
                        ${Number((comp.parts_cost ?? 0) + (comp.labor_cost ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    )}
                    <span style={{ color: COLOR_ACCENT, fontSize: 14, marginLeft: 8, flexShrink: 0, opacity: 0.55 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Notes ── */}
          {session.notes && (
            <div style={{ margin: '28px 20px 0' }}>
              <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>Notes</div>
              <p style={{
                fontFamily: FONT_UI, fontSize: 13, lineHeight: 1.65,
                color: 'rgba(245,240,228,0.55)', margin: 0,
                whiteSpace: 'pre-wrap',
              }}>
                {session.notes}
              </p>
            </div>
          )}

          {/* ── Delete ── */}
          <div style={{ margin: '40px 20px 0' }}>
            <button
              onClick={() => setDeleteSheet(true)}
              style={{
                width: '100%', padding: '13px 0',
                background: 'transparent',
                border: '1px solid rgba(180,30,30,0.35)',
                cursor: 'pointer',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'rgba(180,30,30,0.55)',
                WebkitTapHighlightColor: 'transparent',
                transition: 'all 180ms ease',
              }}
            >
              Delete Build Entry
            </button>
          </div>

        </div>
      )}

      {/* ── Delete confirmation overlay ── */}
      {deleteSheet && (
        <div
          onClick={() => !deleting && setDeleteSheet(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.80)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: '#111114',
              borderTop: '1px solid rgba(245,240,228,0.08)',
              padding: '24px 20px 44px',
            }}
          >
            <p style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 14,
              color: 'rgba(245,240,228,0.85)', margin: '0 0 6px',
            }}>
              Delete this build entry?
            </p>
            <p style={{
              fontFamily: FONT_UI, fontSize: 12,
              color: 'rgba(245,240,228,0.38)', margin: '0 0 24px', lineHeight: 1.5,
            }}>
              This will permanently remove "{session?.title}" and all {components.length} component{components.length !== 1 ? 's' : ''} from your Build Sheet.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                width: '100%', padding: '14px 0',
                background: 'rgba(160,30,30,0.18)',
                border: '1px solid rgba(160,30,30,0.55)',
                cursor: deleting ? 'default' : 'pointer',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: deleting ? 'rgba(245,240,228,0.3)' : 'rgba(220,60,60,0.85)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button
              onClick={() => setDeleteSheet(false)}
              style={{
                width: '100%', padding: '14px 0', marginTop: 10,
                background: 'transparent', border: '1px solid rgba(245,240,228,0.10)',
                cursor: 'pointer',
                fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'rgba(245,240,228,0.35)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
