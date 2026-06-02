// Route: /garage/reminders — Reminders (deadlines + due dates + service intervals) (Part 10)
//
// Aesthetic: "Instrument Cluster" — a dark dashboard gauge cluster. Each
// reminder is a telltale (warning light): it glows amber and pulses when
// overdue, glows steady amber when due soon, sits dim when still a way off.
// Date + odometer-style mileage readouts. Distinct from Contacts (leather),
// Snapshot (light grey), Detailing (light blue). Palette-compliant: amber
// accent intensity carries urgency (no new colors); never pure-white text.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import BottomSheet, { FieldLabel, sheetInput } from '../components/BottomSheet'
import {
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

// Cluster palette
const CLUSTER_BG  = 'radial-gradient(ellipse 130% 90% at 50% -10%, #16181b 0%, #0c0d0f 55%, #060607 100%)'
const CREAM       = '#f0e4c8'
const DIM         = 'rgba(240,228,200,0.4)'
const FAINT       = 'rgba(240,228,200,0.16)'
const SHEET_BG    = '#121315'

// Categories (matches car_reminders.category check)
const CATEGORIES = ['service', 'registration', 'insurance', 'emissions', 'inspection', 'warranty', 'lease', 'other'] as const
type Category = typeof CATEGORIES[number]
const CATEGORY_LABEL: Record<Category, string> = {
  service: 'Service', registration: 'Registration', insurance: 'Insurance',
  emissions: 'Emissions', inspection: 'Inspection', warranty: 'Warranty',
  lease: 'Lease', other: 'Other',
}

// Urgency thresholds
const DUE_SOON_DAYS  = 30
const DUE_SOON_MILES = 1000

type Reminder = {
  id: string
  title: string
  category: Category | null
  notes: string | null
  due_date: string | null
  due_mileage: number | null
  is_complete: boolean
  completed_at: string | null
  job_id: string | null
  remind_days_before: number | null
}

type Draft = {
  id?: string
  title: string
  category: Category
  notes: string
  due_date: string
  due_mileage: string
  job_id: string | null
  job_title: string | null   // display-only label for a linked part
}

const EMPTY_DRAFT: Draft = { title: '', category: 'service', notes: '', due_date: '', due_mileage: '', job_id: null, job_title: null }

type Urgency = 'overdue' | 'soon' | 'upcoming'
const RANK: Record<Urgency, number> = { overdue: 0, soon: 1, upcoming: 2 }

// Compute the most-urgent status across date + mileage triggers.
function urgencyOf(r: Reminder, currentMileage: number | null): { level: Urgency; readout: string } {
  let level: Urgency = 'upcoming'
  const bump = (l: Urgency) => { if (RANK[l] < RANK[level]) level = l }
  const readouts: string[] = []

  if (r.due_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(r.due_date + 'T00:00:00')
    const days = Math.round((due.getTime() - today.getTime()) / 86400000)
    // Custom lead time (e.g. "remind 3 months before") widens the soon window.
    const soonDays = r.remind_days_before ?? DUE_SOON_DAYS
    if (days < 0) { bump('overdue'); readouts.push(`${Math.abs(days)}d overdue`) }
    else if (days === 0) { bump('soon'); readouts.push('due today') }
    else { if (days <= soonDays) bump('soon'); readouts.push(`in ${days}d`) }
  }

  if (r.due_mileage != null) {
    if (currentMileage != null) {
      const miles = r.due_mileage - currentMileage
      if (miles <= 0) { bump('overdue'); readouts.push(`${Math.abs(miles).toLocaleString()} mi over`) }
      else { if (miles <= DUE_SOON_MILES) bump('soon'); readouts.push(`in ${miles.toLocaleString()} mi`) }
    } else {
      readouts.push(`at ${r.due_mileage.toLocaleString()} mi`)
    }
  }

  return { level, readout: readouts.join('  ·  ') }
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

// Telltale indicator — a glowing warning-light glyph
function Telltale({ level }: { level: Urgency }) {
  const lit = level !== 'upcoming'
  const color = lit ? COLOR_ACCENT : FAINT
  const glow = level === 'overdue' ? `0 0 14px ${COLOR_ACCENT}, 0 0 4px ${COLOR_ACCENT}`
            : level === 'soon'    ? `0 0 8px rgba(200,102,26,0.6)`
            : 'none'
  return (
    <div style={{
      width: 30, height: 30, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '50%',
      border: `1.5px solid ${lit ? 'rgba(200,102,26,0.55)' : FAINT}`,
      boxShadow: glow,
      animation: level === 'overdue' ? 'telltalePulse 1.4s ease-in-out infinite' : undefined,
    }}>
      {/* warning triangle glyph */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
  )
}

export default function GarageRemindersPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [carId, setCarId]               = useState<string | null>(null)
  const [carInfo, setCarInfo]           = useState<string | null>(null)
  const [currentMileage, setCurrentMileage] = useState<number | null>(null)
  const [reminders, setReminders]       = useState<Reminder[]>([])
  const [loading, setLoading]           = useState(true)
  const [noCar, setNoCar]               = useState(false)

  const [draft, setDraft]   = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Open the add sheet pre-linked to a part when arriving from a part detail page.
  const prefillRef = useRef(location.state as { reminderForJob?: { id: string; title: string; category?: string } } | null)

  useEffect(() => {
    async function load() {
      const id = await getActiveCarId()
      if (!id) { setLoading(false); setNoCar(true); return }
      setCarId(id)

      const REM_FULL = 'id, title, category, notes, due_date, due_mileage, is_complete, completed_at, job_id, remind_days_before'
      const REM_BASE = 'id, title, category, notes, due_date, due_mileage, is_complete, completed_at, job_id'
      const [{ data: car }, remFull] = await Promise.all([
        supabase.from('cars').select('year, model, current_mileage').eq('id', id).is('deleted_at', null).single(),
        supabase.from('car_reminders').select(REM_FULL).eq('car_id', id).order('due_date', { ascending: true, nullsFirst: false }),
      ])
      let rows: unknown[] | null = remFull.data
      if (remFull.error) {
        const remBase = await supabase.from('car_reminders').select(REM_BASE).eq('car_id', id).order('due_date', { ascending: true, nullsFirst: false })
        rows = remBase.data
      }

      if (car) {
        setCarInfo([car.year, car.model].filter(Boolean).join(' '))
        setCurrentMileage(car.current_mileage ?? null)
      }
      setReminders((rows ?? []) as Reminder[])
      setLoading(false)

      // Prefill from part link, then clear router state so back/refresh won't re-open.
      const pf = prefillRef.current?.reminderForJob
      if (pf) {
        const cat = (CATEGORIES as readonly string[]).includes(pf.category ?? '') ? (pf.category as Category) : 'service'
        setDraft({ ...EMPTY_DRAFT, title: pf.title ? `${pf.title} service` : '', category: cat, job_id: pf.id, job_title: pf.title })
        prefillRef.current = null
        navigate('.', { replace: true, state: null })
      }
    }
    load()
  }, [navigate])

  function openNew() { setDraft({ ...EMPTY_DRAFT }) }

  function openEdit(r: Reminder) {
    setDraft({
      id: r.id,
      title: r.title,
      category: r.category ?? 'other',
      notes: r.notes ?? '',
      due_date: r.due_date ?? '',
      due_mileage: r.due_mileage != null ? String(r.due_mileage) : '',
      job_id: r.job_id,
      job_title: null,
    })
  }

  async function save() {
    if (!draft || !carId) return
    const title = draft.title.trim()
    if (!title) { titleInputRef.current?.focus(); return }

    setSaving(true)
    const mileage = draft.due_mileage.trim() ? parseInt(draft.due_mileage.replace(/[^\d]/g, ''), 10) : null
    const payload = {
      title,
      category: draft.category,
      notes: draft.notes.trim() || null,
      due_date: draft.due_date || null,
      due_mileage: Number.isFinite(mileage as number) ? mileage : null,
      job_id: draft.job_id,
    }

    if (draft.id) {
      const { data, error } = await supabase
        .from('car_reminders').update(payload).eq('id', draft.id)
        .select('id, title, category, notes, due_date, due_mileage, is_complete, completed_at, job_id').single()
      if (!error && data) setReminders(prev => prev.map(r => (r.id === draft.id ? (data as Reminder) : r)))
    } else {
      const { data, error } = await supabase
        .from('car_reminders').insert({ ...payload, car_id: carId })
        .select('id, title, category, notes, due_date, due_mileage, is_complete, completed_at, job_id').single()
      if (!error && data) setReminders(prev => [...prev, data as Reminder])
    }
    setSaving(false)
    setDraft(null)
  }

  async function toggleComplete(r: Reminder) {
    const next = !r.is_complete
    const completed_at = next ? new Date().toISOString() : null
    setReminders(prev => prev.map(x => (x.id === r.id ? { ...x, is_complete: next, completed_at } : x)))
    await supabase.from('car_reminders').update({ is_complete: next, completed_at }).eq('id', r.id)
  }

  async function remove() {
    if (!draft?.id) return
    setSaving(true)
    const { error } = await supabase.from('car_reminders').delete().eq('id', draft.id)
    if (!error) setReminders(prev => prev.filter(r => r.id !== draft.id))
    setSaving(false)
    setDraft(null)
  }

  // Active sorted by urgency (overdue → soon → upcoming), each by its readout proximity.
  const active = reminders.filter(r => !r.is_complete)
  const done   = reminders.filter(r => r.is_complete)
  const activeSorted = active
    .map(r => ({ r, ...urgencyOf(r, currentMileage) }))
    .sort((a, b) => RANK[a.level] - RANK[b.level])

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: CLUSTER_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes telltalePulse { 0%,100% { box-shadow: 0 0 14px ${COLOR_ACCENT}, 0 0 4px ${COLOR_ACCENT}; } 50% { box-shadow: 0 0 4px rgba(200,102,26,0.4); } }
        @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/garage')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Reminders</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {carInfo && (
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10 }}>
              {carInfo}
            </span>
          )}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%' }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: DIM, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {!loading && noCar && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: SPACE_MD, padding: `0 ${SPACE_XL}px` }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontStyle: 'italic', fontSize: 24, letterSpacing: '-0.05em', color: CREAM, margin: 0, textAlign: 'center', lineHeight: 1.2 }}>No car in the garage</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: DIM, margin: 0, textAlign: 'center', lineHeight: 1.6 }}>Add a car from My Cars first.</p>
            <button onClick={() => navigate('/garage/cars')} style={{ marginTop: SPACE_SM, padding: '10px 24px', background: 'none', border: `1px solid ${FAINT}`, color: CREAM, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              My Cars
            </button>
          </div>
        )}

        {!loading && !noCar && (
          <div style={{ padding: `${SPACE_LG}px ${SPACE_MD}px ${SPACE_XL * 3}px` }}>

            {/* Mileage readout strip — the odometer */}
            {currentMileage != null && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE_SM, marginBottom: SPACE_LG }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM }}>Odometer</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 17, letterSpacing: '0.06em', color: COLOR_ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                  {currentMileage.toLocaleString()} <span style={{ fontSize: 11, color: DIM }}>mi</span>
                </span>
              </div>
            )}

            {/* Empty state */}
            {reminders.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE_SM, padding: `${SPACE_XL}px 0`, opacity: 0.55 }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM }}>All clear</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: DIM }}>No reminders set. Tap + to add one.</span>
              </div>
            )}

            {/* Active reminders */}
            {activeSorted.map(({ r, level, readout }, i) => (
              <button
                key={r.id}
                onClick={() => openEdit(r)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: SPACE_MD,
                  background: level === 'overdue' ? 'rgba(200,102,26,0.07)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${level === 'overdue' ? 'rgba(200,102,26,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  borderLeft: `3px solid ${level === 'upcoming' ? FAINT : COLOR_ACCENT}`,
                  padding: `${SPACE_MD}px ${SPACE_MD}px`,
                  marginBottom: SPACE_SM, cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  animation: `rowIn 380ms ${EASING_SETTLE} ${i * 45}ms both`,
                }}
              >
                <Telltale level={level} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM }}>
                    <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: CREAM, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                    {r.job_id && <span title="Linked to a part" style={{ fontSize: 10, color: COLOR_ACCENT, flexShrink: 0 }}>⚙</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, marginTop: 3, flexWrap: 'wrap' }}>
                    {r.category && (
                      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: DIM, border: `1px solid ${FAINT}`, padding: '1px 5px' }}>
                        {CATEGORY_LABEL[r.category]}
                      </span>
                    )}
                    <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 11.5, letterSpacing: '0.02em', color: level === 'overdue' ? COLOR_ACCENT : DIM, fontVariantNumeric: 'tabular-nums' }}>
                      {readout || fmtDate(r.due_date) || 'No trigger set'}
                    </span>
                  </div>
                </div>
                {/* Mark done */}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); toggleComplete(r) }}
                  style={{
                    width: 26, height: 26, flexShrink: 0,
                    border: `1.5px solid ${FAINT}`, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: DIM, fontSize: 13,
                  }}
                >
                  ✓
                </span>
              </button>
            ))}

            {/* Completed */}
            {done.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, margin: `${SPACE_LG}px 0 ${SPACE_SM}px` }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: DIM }}>Done</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
                {done.map(r => (
                  <button
                    key={r.id}
                    onClick={() => openEdit(r)}
                    style={{
                      width: '100%', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: SPACE_MD,
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: `${SPACE_SM}px ${SPACE_MD}px`, opacity: 0.45,
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    <span
                      role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); toggleComplete(r) }}
                      style={{ width: 26, height: 26, flexShrink: 0, border: `1.5px solid ${COLOR_ACCENT}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR_ACCENT, fontSize: 13 }}
                    >✓</span>
                    <span style={{ flex: 1, fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: CREAM, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Add FAB */}
        {!loading && !noCar && (
          <button
            onClick={openNew}
            aria-label="Add reminder"
            style={{
              position: 'fixed', right: SPACE_LG, bottom: SPACE_LG,
              width: 56, height: 56, borderRadius: '50%',
              background: COLOR_ACCENT, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.2)', zIndex: 20,
            }}
          >
            <span style={{ color: '#fff5dc', fontSize: 30, fontWeight: 300, lineHeight: 1, marginTop: -2 }}>+</span>
          </button>
        )}
      </div>

      {/* ── Add / Edit sheet ── */}
      <BottomSheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit Reminder' : 'New Reminder'} bg={SHEET_BG} busy={saving}>
        {draft && (
          <>
            {/* Linked part badge */}
            {draft.job_title && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: SPACE_MD, padding: '8px 10px', background: 'rgba(200,102,26,0.1)', border: '1px solid rgba(200,102,26,0.35)' }}>
                <span style={{ color: COLOR_ACCENT, fontSize: 12 }}>⚙</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', color: COLOR_ACCENT }}>Linked to {draft.job_title}</span>
              </div>
            )}

            <FieldLabel>Title *</FieldLabel>
            <input ref={titleInputRef} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="Oil change, registration renewal…" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Category</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginBottom: SPACE_MD }}>
              {CATEGORIES.map(c => {
                const active = draft.category === c
                return (
                  <button key={c} onClick={() => setDraft({ ...draft, category: c })} style={{
                    padding: '6px 12px',
                    background: active ? COLOR_ACCENT : 'rgba(240,228,200,0.05)',
                    border: `1px solid ${active ? COLOR_ACCENT : FAINT}`,
                    color: active ? '#fff5dc' : 'rgba(240,228,200,0.7)',
                    fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', cursor: 'pointer',
                  }}>{CATEGORY_LABEL[c]}</button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: SPACE_MD }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Due date</FieldLabel>
                <input type="date" value={draft.due_date} onChange={e => setDraft({ ...draft, due_date: e.target.value })} style={{ ...sheetInput, colorScheme: 'dark', marginBottom: SPACE_MD }} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Due mileage (mi)</FieldLabel>
                <input value={draft.due_mileage} onChange={e => setDraft({ ...draft, due_mileage: e.target.value })} placeholder="e.g. 90000" inputMode="numeric" style={{ ...sheetInput, marginBottom: SPACE_MD }} />
              </div>
            </div>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: DIM, margin: `-6px 0 ${SPACE_MD}px`, lineHeight: 1.4 }}>
              Set a date, a mileage, or both — whichever comes first lights up.
            </p>

            <FieldLabel>Notes</FieldLabel>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Synthetic 5W-30 · book a week ahead…" rows={3} style={{ ...sheetInput, resize: 'none', marginBottom: SPACE_LG }} />

            <button onClick={save} disabled={saving} style={{
              width: '100%', minHeight: 48, background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer',
              color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Add Reminder'}</button>

            {draft.id && (
              <button onClick={remove} disabled={saving} style={{
                width: '100%', minHeight: 44, marginTop: SPACE_SM, background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer',
                color: '#d27a5e', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Delete Reminder</button>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  )
}
