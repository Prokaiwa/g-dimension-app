// Route: /garage/pdf — Build PDF: generate a downloadable build sheet (Part 10, Part 15)
//
// Loads the active car's identity, stats, and grouped mods (same model as the
// on-screen Build Sheet), shows a quick summary, and generates a vector PDF
// on-device via src/lib/buildPdf.ts. Download always; Share when the platform
// supports sharing files (so it can drop straight into Messages/Mail/etc.).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { playBack } from '../lib/sound'
import { generateBuildPdf, pdfFilename, type PdfData, type PdfSection } from '../lib/buildPdf'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M, COLOR_ACCENT, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  RADIUS_BUTTON,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const BG         = '#e8e8e6'
const CARD_BG    = '#f4f4f2'
const TEXT       = '#1a1a1c'
const TEXT_MUTED = 'rgba(26,26,28,0.4)'
const BORDER     = 'rgba(0,0,0,0.07)'

// Display groups (frontend-only) — must match TuningBuildSheetPage MOD_GROUPS.
const MOD_GROUPS = [
  { id: 'power',    label: 'Power',    categories: ['Engine','Drivetrain','Forced Induction','Exhaust','Cooling','Fuel System','Electrical'] },
  { id: 'chassis',  label: 'Chassis',  categories: ['Suspension','Brakes','Wheels & Tires'] },
  { id: 'exterior', label: 'Exterior', categories: ['Exterior','Paint & Wrap','Lighting'] },
  { id: 'interior', label: 'Interior', categories: ['Interior','Audio','Safety'] },
  { id: 'other',    label: 'Other',    categories: ['Other'] },
]

export default function GaragePdfPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData]       = useState<PdfData | null>(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [done, setDone]       = useState(false)

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare

  useEffect(() => {
    async function load() {
      const carId = await getActiveCarId()
      if (!carId) { setLoading(false); return }

      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id

      const [{ data: car }, { data: mods }, { data: sess }, ownerRes] = await Promise.all([
        supabase
          .from('cars')
          .select('id, year, make, model, variant, garage_photo_url, original_photo_url, horsepower, torque, weight_lbs')
          .eq('id', carId).single(),
        supabase
          .from('jobs')
          .select('id, title, brand, category, session_id, parts_cost, labor_cost')
          .eq('car_id', carId).eq('status', 'installed').eq('type', 'modification')
          .order('date_installed', { ascending: false, nullsFirst: false }),
        supabase
          .from('sessions')
          .select('id, title, total_cost, jobs(id, category)')
          .eq('car_id', carId).eq('type', 'modification').not('title', 'is', null),
        uid
          ? supabase.from('users').select('display_name, username').eq('id', uid).single()
          : Promise.resolve({ data: null }),
      ])

      if (!car) { setLoading(false); return }

      type JobRow = { id: string; title: string; brand: string | null; category: string | null; session_id: string | null; parts_cost: number | null; labor_cost: number | null }
      type SessRow = { id: string; title: string; total_cost: number | null; jobs: { id: string; category: string | null }[] }
      const jobs = (mods ?? []) as JobRow[]
      const sessions = (sess ?? []) as unknown as SessRow[]

      // Build investment = sum of every installed mod's parts + labor cost.
      const investment = jobs.reduce((s, j) => s + (j.parts_cost ?? 0) + (j.labor_cost ?? 0), 0)

      const groupedSessionIds = new Set(sessions.map(s => s.id))
      const sessionGroupId = (sjobs: { category: string | null }[]): string => {
        for (const j of sjobs) for (const g of MOD_GROUPS) if (g.categories.includes(j.category ?? '')) return g.id
        return 'other'
      }

      const sections: PdfSection[] = MOD_GROUPS.map(g => {
        const solo = jobs.filter(j => g.categories.includes(j.category ?? '') && !groupedSessionIds.has(j.session_id ?? ''))
        const groups = sessions
          .filter(s => sessionGroupId(s.jobs ?? []) === g.id)
          .map(s => ({ title: s.title, componentCount: (s.jobs ?? []).length, total_cost: s.total_cost }))
        return { label: g.label, groups, mods: solo.map(j => ({ title: j.title, brand: j.brand })) }
      }).filter(s => s.groups.length > 0 || s.mods.length > 0)

      const owner = (ownerRes.data ?? null) as { display_name: string | null; username: string | null } | null

      setData({
        car: car as unknown as PdfData['car'],
        ownerName: owner?.display_name ?? null,
        ownerHandle: owner?.username ?? null,
        sections,
        investment: investment > 0 ? investment : null,
      })
      setLoading(false)
    }
    load()
  }, [])

  const modCount = data ? data.sections.reduce((s, sec) => s + sec.mods.length + sec.groups.length, 0) : 0
  const title = data ? ([data.car.year, data.car.model, data.car.variant].filter(Boolean).join(' ') || 'Build') : ''

  async function build(share: boolean) {
    if (!data || busy) return
    setBusy(true); setErr(null); setDone(false)
    try {
      const doc = await generateBuildPdf(data)
      const name = pdfFilename(data.car)
      if (share && canShare) {
        const blob = doc.output('blob')
        const file = new File([blob], name, { type: 'application/pdf' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${title} — Build Sheet` })
          setBusy(false); return
        }
      }
      doc.save(name)
      setDone(true)
    } catch (e) {
      // A user-cancelled share rejects — don't treat that as an error.
      if ((e as Error)?.name !== 'AbortError') setErr('Could not generate the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: BG, fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => { playBack(); navigate('/garage') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Build PDF</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {data && (
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10 }}>
              {title}
            </span>
          )}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 40px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%' }}>
            <span style={{ fontSize: 12, color: TEXT_MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        ) : !data ? (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ fontSize: 14, color: TEXT_MUTED }}>No active car. Add a car first.</p>
          </div>
        ) : (
          <>
            {/* Intro */}
            <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontSize: 24, color: TEXT, margin: '0 0 6px', lineHeight: 1.15 }}>
              Your build, on paper.
            </p>
            <p style={{ fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5, margin: '0 0 22px' }}>
              A clean, printable build sheet — cover photo, identity, key figures, and every mod grouped by section. Hand it to a buyer, a shop, or keep it for the record.
            </p>

            {/* Contents summary */}
            <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, padding: '14px 16px', marginBottom: 22 }}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEXT_MUTED, marginBottom: 10 }}>Included</div>
              <Row label="Vehicle" value={title} />
              <Row label="Modifications" value={String(modCount)} />
              {data.investment != null && <Row label="Build investment" value={'$' + Math.round(data.investment).toLocaleString('en-US')} accent />}
              {(data.ownerName || data.ownerHandle) && (
                <Row label="Owner" value={[data.ownerName, data.ownerHandle ? '@' + data.ownerHandle : ''].filter(Boolean).join('  ')} />
              )}
            </div>

            {err && <p style={{ fontSize: 12, color: COLOR_BURGUNDY_M, marginBottom: 14 }}>{err}</p>}
            {done && !err && <p style={{ fontSize: 12, color: COLOR_ACCENT, marginBottom: 14 }}>Saved. Check your downloads.</p>}

            {/* Actions */}
            <button
              onClick={() => build(false)}
              disabled={busy}
              style={{
                width: '100%', padding: '15px 0', borderRadius: RADIUS_BUTTON, border: 'none',
                background: busy ? 'rgba(200,102,26,0.5)' : COLOR_ACCENT, color: '#fff5dc',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.04em',
                cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              {busy ? 'Generating…' : 'Download PDF'}
            </button>

            {canShare && (
              <button
                onClick={() => build(true)}
                disabled={busy}
                style={{
                  width: '100%', padding: '14px 0', marginTop: 10, borderRadius: RADIUS_BUTTON,
                  background: 'transparent', border: `1px solid ${COLOR_ACCENT}`, color: COLOR_ACCENT,
                  fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.04em',
                  cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent', opacity: busy ? 0.5 : 1,
                }}
              >
                Share PDF
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontFamily: FONT_UI, fontSize: 13, color: TEXT_MUTED }}>{label}</span>
      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: accent ? COLOR_ACCENT : TEXT, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
