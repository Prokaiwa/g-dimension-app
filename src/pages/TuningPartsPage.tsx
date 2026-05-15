// Route: /tuning/parts-bin — Owned, not installed
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  FONT_HANDWRITTEN, FONT_STAMP, FONT_UI,
  COLOR_CARDBOARD_BG, COLOR_CARDBOARD_INK, COLOR_CARDBOARD_INK2, COLOR_CARDBOARD_STAMP,
} from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────

type Part = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_removed: string | null
  date_installed: string | null
  parts_cost: number | null
  status: string
}

// ── Kraft paper grain ─────────────────────────────────────────────────────

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return null
  const parts = d.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parts[1] - 1]} ${parts[0]}`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TuningPartsPage() {
  const navigate = useNavigate()

  const [pulled,  setPulled]  = useState<Part[]>([])
  const [onHand,  setOnHand]  = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [putting, setPutting] = useState<string | null>(null)

  async function load() {
    const carId = await getActiveCarId()
    if (!carId) { setLoading(false); return }

    const { data } = await supabase
      .from('jobs')
      .select('id, title, brand, category, date_removed, date_installed, parts_cost, status')
      .eq('car_id', carId)
      .eq('type', 'modification')
      .eq('still_owned', true)
      .in('status', ['removed', 'purchased'])
      .order('date_removed', { ascending: false, nullsFirst: false })

    const all = (data ?? []) as Part[]
    setPulled(all.filter(p => p.status === 'removed'))
    setOnHand(all.filter(p => p.status === 'purchased'))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handlePutBack = async (part: Part) => {
    setPutting(part.id)
    await supabase
      .from('jobs')
      .update({ status: 'installed', date_removed: null })
      .eq('id', part.id)
    await load()
    setPutting(null)
  }

  const isEmpty = pulled.length === 0 && onHand.length === 0

  return (
    <div style={{
      minHeight: '100dvh',
      background: COLOR_CARDBOARD_BG,
      backgroundImage: [
        `repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(100,60,20,0.07) 14px, rgba(100,60,20,0.07) 15px)`,
        `radial-gradient(ellipse 100% 100% at 50% 50%, transparent 60%, rgba(80,40,10,0.25) 100%)`,
      ].join(', '),
      position: 'relative',
    }}>

      {/* Kraft paper grain */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1,
        backgroundImage: NOISE_SVG,
        backgroundSize: '180px 180px',
        opacity: 0.09,
        mixBlendMode: 'multiply',
      }} />

      <div style={{ position: 'relative', zIndex: 2, paddingBottom: 60 }}>

        {/* Back nav */}
        <button
          onClick={() => navigate('/tuning')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '16px 20px 0',
            display: 'flex', alignItems: 'center', gap: 4,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ color: COLOR_CARDBOARD_STAMP, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_HANDWRITTEN, fontWeight: 600, fontSize: 16, color: COLOR_CARDBOARD_STAMP }}>
            Tuning
          </span>
        </button>

        {/* Stamp header */}
        <div style={{ padding: '12px 24px 0', textAlign: 'center' }}>
          <p style={{
            fontFamily: FONT_STAMP, fontSize: 38,
            color: COLOR_CARDBOARD_INK, opacity: 0.82,
            margin: 0, transform: 'rotate(-1.5deg)', lineHeight: 1,
          }}>
            Parts Bin
          </p>
          <div style={{ width: 120, height: 3, background: COLOR_CARDBOARD_INK, opacity: 0.15, margin: '8px auto 0' }} />
        </div>

        {/* Loading */}
        {loading && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 18, color: COLOR_CARDBOARD_INK2, textAlign: 'center', marginTop: 60, opacity: 0.6 }}>
            checking the box...
          </p>
        )}

        {/* Empty */}
        {!loading && isEmpty && (
          <div style={{ textAlign: 'center', marginTop: 60, padding: '0 40px' }}>
            <p style={{ fontFamily: FONT_STAMP, fontSize: 22, color: COLOR_CARDBOARD_INK, opacity: 0.35, margin: 0 }}>
              Empty
            </p>
            <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 17, color: COLOR_CARDBOARD_INK2, opacity: 0.5, marginTop: 10, lineHeight: 1.5 }}>
              Parts removed from the car but kept will show up here
            </p>
          </div>
        )}

        {/* Pulled from car */}
        {pulled.length > 0 && (
          <Section label="Pulled from car" style={{ marginTop: 28 }}>
            {pulled.map((part, i) => (
              <PartRow
                key={part.id}
                part={part}
                dateLabel={formatDate(part.date_removed)}
                dateLine="pulled"
                putting={putting === part.id}
                onPutBack={() => handlePutBack(part)}
                isLast={i === pulled.length - 1}
              />
            ))}
          </Section>
        )}

        {/* On hand */}
        {onHand.length > 0 && (
          <Section label="On hand" style={{ marginTop: pulled.length > 0 ? 32 : 28 }}>
            {onHand.map((part, i) => (
              <PartRow
                key={part.id}
                part={part}
                dateLabel={formatDate(part.date_installed)}
                dateLine="acquired"
                putting={putting === part.id}
                onPutBack={() => handlePutBack(part)}
                isLast={i === onHand.length - 1}
              />
            ))}
          </Section>
        )}

      </div>
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────

function Section({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: '0 20px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.15 }} />
        <p style={{
          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 13,
          color: COLOR_CARDBOARD_INK2, opacity: 0.6,
          letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0,
        }}>
          {label}
        </p>
        <div style={{ flex: 1, height: 1, background: COLOR_CARDBOARD_INK, opacity: 0.15 }} />
      </div>
      {children}
    </div>
  )
}

// ── Part Row ──────────────────────────────────────────────────────────────

import React from 'react'

function PartRow({ part, dateLabel, dateLine, putting, onPutBack, isLast }: {
  part: Part
  dateLabel: string | null
  dateLine: string
  putting: boolean
  onPutBack: () => void
  isLast: boolean
}) {
  return (
    <div style={{
      paddingTop: 16, paddingBottom: 16,
      borderBottom: isLast ? 'none' : `1px solid rgba(100,60,20,0.18)`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Part name */}
        <p style={{
          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 22,
          color: COLOR_CARDBOARD_INK, margin: 0, lineHeight: 1.1,
        }}>
          {part.title}
        </p>

        {/* Brand + category */}
        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          {part.brand && (
            <span style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 15, color: COLOR_CARDBOARD_INK2, opacity: 0.7 }}>
              {part.brand}
            </span>
          )}
          {part.category && (
            <span style={{
              fontFamily: FONT_UI, fontWeight: 700, fontSize: 8,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: COLOR_CARDBOARD_STAMP,
              border: `1px solid ${COLOR_CARDBOARD_STAMP}`,
              padding: '2px 5px', opacity: 0.65,
            }}>
              {part.category}
            </span>
          )}
        </div>

        {/* Date */}
        {dateLabel && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: COLOR_CARDBOARD_INK2, opacity: 0.5, margin: '4px 0 0' }}>
            {dateLine} {dateLabel}
          </p>
        )}

        {/* Cost */}
        {part.parts_cost != null && (
          <p style={{ fontFamily: FONT_HANDWRITTEN, fontSize: 14, color: COLOR_CARDBOARD_INK2, opacity: 0.45, margin: '2px 0 0' }}>
            ${part.parts_cost.toLocaleString()}
          </p>
        )}
      </div>

      {/* Put Back button */}
      <button
        onClick={onPutBack}
        disabled={putting}
        style={{
          flexShrink: 0, marginTop: 4,
          padding: '8px 14px',
          background: 'rgba(139,58,10,0.1)',
          border: `1.5px solid ${putting ? 'rgba(139,58,10,0.2)' : 'rgba(139,58,10,0.45)'}`,
          cursor: putting ? 'default' : 'pointer',
          WebkitTapHighlightColor: 'transparent',
          transition: 'border-color 150ms ease',
        }}
      >
        <span style={{
          fontFamily: FONT_HANDWRITTEN, fontWeight: 700, fontSize: 14,
          color: putting ? COLOR_CARDBOARD_INK2 : COLOR_CARDBOARD_STAMP,
          opacity: putting ? 0.4 : 1,
          whiteSpace: 'nowrap',
        }}>
          {putting ? 'putting back…' : 'Put Back →'}
        </span>
      </button>

    </div>
  )
}
