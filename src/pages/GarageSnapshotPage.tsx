// Route: /garage/snapshot — Handoff card: show your mechanic, spouse, or dealer (Part 10, Part 11)
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import garagePlaceholder from '../assets/garage_placeholder.webp'
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
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

// Always parse a date-only string as local midnight, never UTC.
function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null
  const dt = new Date(d.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return null
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

// Whole days from local-midnight today to a due date (negative = overdue).
function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(d.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(due.getTime())) return null
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

// Page palette — light grey, dark text
const BG         = '#e8e8e6'
const CARD_BG    = '#f4f4f2'
const TEXT       = '#1a1a1c'
const TEXT_MUTED = 'rgba(26,26,28,0.4)'
const TEXT_EMPTY = 'rgba(26,26,28,0.22)'
const BORDER     = 'rgba(0,0,0,0.07)'
const RULE       = 'rgba(0,0,0,0.1)'

type SnapshotCar = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  variant: string | null
  nickname: string
  color: string | null
  is_import: boolean
  vin: string | null
  license_plate: string | null
  engine_type: string | null
  oil_type: string | null
  tire_size: string | null
  battery_model: string | null
  current_mileage: number | null
  garage_photo_url: string | null
  photo_y_offset: number
}

const LABEL_S: React.CSSProperties = {
  fontFamily: FONT_UI,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: TEXT_MUTED,
  marginBottom: 3,
}

function Cell({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  const empty = value == null || value === ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: CARD_BG, border: `1px solid ${BORDER}`, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={LABEL_S}>{label}</span>
      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: empty ? TEXT_EMPTY : TEXT }}>
        {empty ? '—' : value}
      </span>
    </div>
  )
}

// A cell whose value carries an upcoming/overdue status badge (renewal dates).
function DateCell({ label, due, wide, route }: { label: string; due: string | null | undefined; wide?: boolean; route: string }) {
  const navigate = useNavigate()
  const formatted = fmtDate(due)
  const days = daysUntil(due)
  const overdue = days != null && days < 0
  return (
    <button onClick={() => navigate(route)} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: CARD_BG, border: `1px solid ${BORDER}`, gridColumn: wide ? '1 / -1' : undefined, cursor: 'pointer', textAlign: 'left' }}>
      <span style={LABEL_S}>{label}</span>
      {formatted ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: TEXT }}>{formatted}</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 5px', color: overdue ? '#fff' : COLOR_ACCENT, background: overdue ? COLOR_BURGUNDY_M : 'transparent', border: `1px solid ${overdue ? COLOR_BURGUNDY_M : COLOR_ACCENT}` }}>
            {overdue ? 'Overdue' : 'Upcoming'}
          </span>
        </span>
      ) : (
        <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: TEXT_EMPTY }}>—</span>
      )}
    </button>
  )
}

// Contact cell — role/label + name + phone, taps through to the contact book.
function ContactCell({ name, label, phone, wide }: { name: string; label: string | null; phone: string | null; wide?: boolean }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate('/garage/contacts')} style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: CARD_BG, border: `1px solid ${BORDER}`, gridColumn: wide ? '1 / -1' : undefined, cursor: 'pointer', textAlign: 'left' }}>
      {label && (
        <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEXT_MUTED, marginBottom: 2 }}>{label}</span>
      )}
      <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, lineHeight: 1.2, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{phone || '—'}</span>
    </button>
  )
}

function StubCell({ label, route, wide }: { label: string; route: string; wide?: boolean }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', background: CARD_BG, border: `1px solid ${BORDER}`, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={LABEL_S}>{label}</span>
      <button onClick={() => navigate(route)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: TEXT_EMPTY, textAlign: 'left' }}>
        Not set — tap to add →
      </button>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, margin: `${SPACE_LG}px 0 ${SPACE_XS}px` }}>
      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEXT_MUTED, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: RULE }} />
    </div>
  )
}

type LastService = { title: string | null; created_at: string }
type ReminderLite = { title: string; category: string | null; due_date: string | null }
type ContactLite = { id: string; name: string | null; label: string | null; phone: string | null }

export default function GarageSnapshotPage() {
  const navigate = useNavigate()
  const [car, setCar]         = useState<SnapshotCar | null>(null)
  const [loading, setLoading] = useState(true)
  const [noCar, setNoCar]     = useState(false)

  const [lastService, setLastService]   = useState<LastService | null>(null)
  const [nextReminder, setNextReminder] = useState<ReminderLite | null>(null)
  const [registration, setRegistration] = useState<ReminderLite | null>(null)
  const [insurance, setInsurance]       = useState<ReminderLite | null>(null)
  const [contacts, setContacts]         = useState<ContactLite[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); setNoCar(true); return }

      const chosenId = localStorage.getItem('gdim_chosen_car_id')
      const COLS = [
        'id', 'year', 'make', 'model', 'variant', 'nickname', 'color', 'is_import',
        'vin', 'license_plate', 'engine_type',
        'oil_type', 'tire_size', 'battery_model', 'current_mileage',
        'garage_photo_url', 'photo_y_offset',
      ].join(', ')

      const base = supabase.from('cars').select(COLS).is('deleted_at', null).eq('user_id', session.user.id)

      // user_contacts is a cross-car contact book (scoped by user_id, no car_id).
      const [{ data }, { data: contactRows }] = await Promise.all([
        chosenId ? base.eq('id', chosenId) : base.order('created_at').limit(1),
        supabase.from('user_contacts')
          .select('id, name, label, phone')
          .eq('user_id', session.user.id)
          .order('display_order', { ascending: true })
          .limit(4),
      ])

      let resolvedCar: SnapshotCar | null = null
      if (data && data.length > 0) {
        resolvedCar = data[0] as unknown as SnapshotCar
      } else if (chosenId) {
        localStorage.removeItem('gdim_chosen_car_id')
        const { data: fb } = await base.order('created_at').limit(1)
        if (fb && fb.length > 0) resolvedCar = fb[0] as unknown as SnapshotCar
      }

      setContacts((contactRows ?? []) as ContactLite[])

      if (!resolvedCar) {
        setNoCar(true)
        setLoading(false)
        return
      }
      setCar(resolvedCar)

      // Per-car data — last service, upcoming reminders, renewal dates.
      const [{ data: svc }, { data: nextRem }, { data: dateRems }] = await Promise.all([
        supabase.from('sessions')
          .select('title, created_at, type')
          .eq('car_id', resolvedCar.id)
          .in('type', ['maintenance', 'detail'])
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('car_reminders')
          .select('title, category, due_date')
          .eq('car_id', resolvedCar.id)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(1),
        supabase.from('car_reminders')
          .select('title, category, due_date')
          .eq('car_id', resolvedCar.id)
          .in('category', ['registration', 'insurance'])
          .order('due_date', { ascending: true, nullsFirst: false }),
      ])

      if (svc && svc.length > 0) setLastService(svc[0] as unknown as LastService)
      if (nextRem && nextRem.length > 0) setNextReminder(nextRem[0] as unknown as ReminderLite)
      const rems = (dateRems ?? []) as unknown as ReminderLite[]
      setRegistration(rems.find(r => r.category === 'registration') ?? null)
      setInsurance(rems.find(r => r.category === 'insurance') ?? null)

      setLoading(false)
    }
    load()
  }, [])

  // Treat the nickname as "not real" if it matches any auto-generated form
  // (current or historical — before make/variant were part of the name).
  const isDefaultNickname = car
    ? [
        [car.year, car.model],
        [car.year, car.make, car.model],
        [car.year, car.model, car.variant],
        [car.year, car.make, car.model, car.variant],
      ].map(parts => parts.filter(Boolean).join(' ')).includes(car.nickname)
    : false

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: BG, fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/garage')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Snapshot</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {car && (
            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10 }}>
              {[car.year, car.model, car.variant].filter(Boolean).join(' ')}
            </span>
          )}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%' }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: TEXT_MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {!loading && noCar && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: SPACE_MD, padding: `0 ${SPACE_XL}px` }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontStyle: 'italic', fontSize: 24, letterSpacing: '-0.05em', color: TEXT, margin: 0, textAlign: 'center', lineHeight: 1.2 }}>No car in the garage</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: TEXT_MUTED, margin: 0, textAlign: 'center', lineHeight: 1.6 }}>Add a car from My Cars first.</p>
            <button onClick={() => navigate('/garage/cars')} style={{ marginTop: SPACE_SM, padding: '10px 24px', background: 'none', border: `1px solid ${RULE}`, color: TEXT, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              My Cars
            </button>
          </div>
        )}

        {!loading && car && (
          <div style={{ padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_XL * 2}px` }}>

            {/* Hero: photo left, identity right */}
            <div style={{ paddingTop: SPACE_LG, paddingBottom: SPACE_MD, borderBottom: `1px solid ${RULE}`, display: 'flex', alignItems: 'flex-start', gap: SPACE_MD }}>
              {/* Car photo */}
              <div style={{
                flexShrink: 0,
                width: 150,
                height: 110,
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'contain',
                backgroundPosition: `center ${car.photo_y_offset ?? 50}%`,
                ...(car.garage_photo_url
                  ? {
                      backgroundImage: `url(${car.garage_photo_url})`,
                      backgroundColor: '#d0d0ce',
                    }
                  : {
                      backgroundImage: `url(${garagePlaceholder})`,
                      backgroundColor: '#0d0d0f',
                      filter: 'brightness(0.12)',
                    }
                ),
              }} />
              {/* Identity text */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE_SM, flexWrap: 'wrap' }}>
                  <p style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 24, letterSpacing: '-0.08em', color: TEXT, margin: 0, lineHeight: 1.1 }}>
                    {[car.year, car.model, car.variant].filter(Boolean).join(' ') || 'Unknown'}
                  </p>
                  {car.is_import && (
                    <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: COLOR_ACCENT, border: `1px solid ${COLOR_ACCENT}`, padding: '2px 5px', flexShrink: 0, marginTop: 4 }}>
                      Import
                    </span>
                  )}
                </div>
                {car.make && (
                  <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, color: TEXT_MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '4px 0 0' }}>
                    {car.make}
                  </p>
                )}
                {car.color && (
                  <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: TEXT, margin: '5px 0 0' }}>
                    {car.color}
                  </p>
                )}
                {!isDefaultNickname && car.nickname && (
                  <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: TEXT_MUTED, margin: '4px 0 0', fontStyle: 'italic' }}>
                    "{car.nickname}"
                  </p>
                )}
              </div>
            </div>

            {/* VEHICLE */}
            <SectionHeader label="Vehicle" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Cell label="VIN"           value={car.vin}           wide />
              <Cell label="License Plate" value={car.license_plate} wide />
              <Cell label="Engine"        value={car.engine_type}   wide />
              <Cell label="Tire Size"     value={car.tire_size} />
              <Cell label="Oil Type"      value={car.oil_type} />
              <Cell label="Battery"       value={car.battery_model} wide />
              <Cell label="Current Mileage" value={car.current_mileage != null ? car.current_mileage.toLocaleString() + ' mi' : null} wide />
            </div>

            {/* SERVICE */}
            <SectionHeader label="Service" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              {lastService ? (
                <Cell label="Last Service" value={`${lastService.title ? lastService.title + ' · ' : ''}${fmtDate(lastService.created_at) ?? ''}`.trim()} wide />
              ) : (
                <StubCell label="Last Service" route="/garage/reminders" wide />
              )}
              {nextReminder ? (
                <Cell label="Next Reminder" value={`${nextReminder.title}${fmtDate(nextReminder.due_date) ? ' · ' + fmtDate(nextReminder.due_date) : ''}`} wide />
              ) : (
                <StubCell label="Next Reminder" route="/garage/reminders" wide />
              )}
            </div>

            {/* IMPORTANT DATES */}
            <SectionHeader label="Important Dates" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              {registration ? (
                <DateCell label="Registration" due={registration.due_date} route="/garage/reminders" />
              ) : (
                <StubCell label="Registration" route="/garage/reminders" />
              )}
              {insurance ? (
                <DateCell label="Insurance" due={insurance.due_date} route="/garage/reminders" />
              ) : (
                <StubCell label="Insurance" route="/garage/reminders" />
              )}
            </div>

            {/* CONTACTS */}
            <SectionHeader label="Contacts" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              {contacts.length > 0 ? (
                contacts.map(c => (
                  <ContactCell key={c.id} name={(c.name && c.name.trim()) || 'Contact'} label={c.label} phone={c.phone} wide />
                ))
              ) : (
                <StubCell label="Contacts" route="/garage/contacts" wide />
              )}
            </div>

            {/* Edit link */}
            <div style={{ marginTop: SPACE_XL, display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => navigate('/garage/cars')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEXT_MUTED, padding: 0 }}>
                Edit car details →
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
