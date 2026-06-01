// Route: /garage/contacts — Contacts (per-car contact book) (Part 10)
//
// Aesthetic: "The Little Black Book" — a leather address-book / business-card
// holder. Dark leather page; each contact is a cream business card with a
// burnt-orange spine, a category tab, the name, and big tappable Call / Text /
// Email / Web actions (the "hand it to your mechanic" handoff use case).
// Distinct from Snapshot (light grey) and Detailing (light blue), but inside
// the design system: sharp corners, Hanken, #c8661a accent, 44px tap targets.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
  COLOR_ACCENT_DIM,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  RADIUS_BOTTOM_SHEET,
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

// Leather page palette
const LEATHER_BG = 'radial-gradient(ellipse 120% 80% at 50% 0%, #241c16 0%, #17110c 55%, #0c0907 100%)'
const CARD_BG    = 'linear-gradient(180deg, #f6f1e6 0%, #ece4d4 100%)'
const CARD_INK   = '#241c14'
const CARD_MUTED = 'rgba(36,28,20,0.5)'
const CARD_LINE  = 'rgba(36,28,20,0.12)'
const SHEET_BG   = '#1a140f'

// Suggested category labels for quick-pick in the form
const LABEL_SUGGESTIONS = ['Mechanic', 'Tuner', 'Body Shop', 'Detailer', 'Insurance', 'Roadside', 'Dealership', 'Parts', 'Other']

type Contact = {
  id: string
  label: string
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  display_order: number
}

// Draft for the add/edit sheet. id present = editing existing.
type Draft = {
  id?: string
  label: string
  name: string
  phone: string
  email: string
  website: string
  notes: string
}

const EMPTY_DRAFT: Draft = { label: '', name: '', phone: '', email: '', website: '', notes: '' }

function normalizeUrl(url: string): string {
  const u = url.trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// ── Tiny stroke icons (sharp, 1.6 weight) ──────────────────────────────
function IconPhone({ size = 16, color = CARD_INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}
function IconMessage({ size = 16, color = CARD_INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  )
}
function IconMail({ size = 16, color = CARD_INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="0" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  )
}
function IconGlobe({ size = 16, color = CARD_INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </svg>
  )
}

// ── Action chip on a contact card (tel:/sms:/mailto:/website) ─────────
function ActionChip({ href, icon, label, external }: { href: string; icon: React.ReactNode; label: string; external?: boolean }) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        minHeight: 34, padding: '0 12px',
        background: 'rgba(36,28,20,0.05)',
        border: `1px solid ${CARD_LINE}`,
        textDecoration: 'none',
        fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
        letterSpacing: '0.04em', color: CARD_INK,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}

export default function GarageContactsPage() {
  const navigate = useNavigate()
  const [carId, setCarId]       = useState<string | null>(null)
  const [carInfo, setCarInfo]   = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)
  const [noCar, setNoCar]       = useState(false)

  // Add/edit sheet
  const [draft, setDraft]   = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const id = await getActiveCarId()
      if (!id) { setLoading(false); setNoCar(true); return }
      setCarId(id)

      const [{ data: car }, { data: rows }] = await Promise.all([
        supabase.from('cars').select('year, model').eq('id', id).is('deleted_at', null).single(),
        supabase
          .from('car_contacts')
          .select('id, label, name, phone, email, website, notes, display_order')
          .eq('car_id', id)
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

      if (car) setCarInfo([car.year, car.model].filter(Boolean).join(' '))
      setContacts((rows ?? []) as Contact[])
      setLoading(false)
    }
    load()
  }, [])

  function openNew() {
    setDraft({ ...EMPTY_DRAFT })
  }

  function openEdit(c: Contact) {
    setDraft({
      id: c.id,
      label: c.label ?? '',
      name: c.name ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      website: c.website ?? '',
      notes: c.notes ?? '',
    })
  }

  async function save() {
    if (!draft || !carId) return
    const label = draft.label.trim()
    if (!label) { labelInputRef.current?.focus(); return }

    setSaving(true)
    const payload = {
      label,
      name: draft.name.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      website: normalizeUrl(draft.website) || null,
      notes: draft.notes.trim() || null,
    }

    if (draft.id) {
      const { data, error } = await supabase
        .from('car_contacts')
        .update(payload)
        .eq('id', draft.id)
        .select('id, label, name, phone, email, website, notes, display_order')
        .single()
      if (!error && data) {
        setContacts(prev => prev.map(c => (c.id === draft.id ? (data as Contact) : c)))
      }
    } else {
      const { data, error } = await supabase
        .from('car_contacts')
        .insert({ ...payload, car_id: carId, display_order: contacts.length })
        .select('id, label, name, phone, email, website, notes, display_order')
        .single()
      if (!error && data) setContacts(prev => [...prev, data as Contact])
    }

    setSaving(false)
    setDraft(null)
  }

  async function remove() {
    if (!draft?.id) return
    setSaving(true)
    const { error } = await supabase.from('car_contacts').delete().eq('id', draft.id)
    if (!error) setContacts(prev => prev.filter(c => c.id !== draft.id))
    setSaving(false)
    setDraft(null)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: LEATHER_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes contactCardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetUp       { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes backdropIn    { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* ── Header (consistent app pattern) ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/garage')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Contacts</span>
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
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(240,228,200,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {!loading && noCar && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: SPACE_MD, padding: `0 ${SPACE_XL}px` }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontStyle: 'italic', fontSize: 24, letterSpacing: '-0.05em', color: '#f0e4c8', margin: 0, textAlign: 'center', lineHeight: 1.2 }}>No car in the garage</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(240,228,200,0.5)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>Add a car from My Cars first.</p>
            <button onClick={() => navigate('/garage/cars')} style={{ marginTop: SPACE_SM, padding: '10px 24px', background: 'none', border: '1px solid rgba(240,228,200,0.2)', color: '#f0e4c8', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              My Cars
            </button>
          </div>
        )}

        {!loading && !noCar && (
          <div style={{ padding: `${SPACE_LG}px ${SPACE_MD}px ${SPACE_XL * 3}px` }}>

            {/* Intro line */}
            <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500, fontSize: 15, color: 'rgba(240,228,200,0.55)', margin: `0 0 ${SPACE_LG}px`, lineHeight: 1.5 }}>
              The people who keep this car running. Hand it to a mechanic and everything's a tap away.
            </p>

            {/* Empty state */}
            {contacts.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE_SM, padding: `${SPACE_XL}px 0`, opacity: 0.5 }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.6)' }}>No contacts yet</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(240,228,200,0.45)' }}>Tap + to add your first one.</span>
              </div>
            )}

            {/* Contact cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_MD }}>
              {contacts.map((c, i) => {
                const phoneClean = c.phone ? c.phone.replace(/[^\d+]/g, '') : ''
                return (
                  <div
                    key={c.id}
                    style={{
                      position: 'relative',
                      background: CARD_BG,
                      borderLeft: `4px solid ${COLOR_ACCENT}`,
                      boxShadow: '0 2px 5px rgba(0,0,0,0.45), 0 10px 22px rgba(0,0,0,0.3)',
                      padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_SM + 2}px`,
                      animation: `contactCardIn 420ms ${EASING_SETTLE} ${i * 55}ms both`,
                    }}
                  >
                    {/* Top row: label tab + edit */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE_SM }}>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: COLOR_ACCENT_DIM }}>
                        {c.label}
                      </span>
                      <button
                        onClick={() => openEdit(c)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: CARD_MUTED }}
                      >
                        Edit
                      </button>
                    </div>

                    {/* Name */}
                    {c.name && (
                      <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 19, letterSpacing: '-0.01em', color: CARD_INK, margin: '3px 0 0', lineHeight: 1.15 }}>
                        {c.name}
                      </p>
                    )}

                    {/* Raw phone/email text (visible read of the numbers) */}
                    {(c.phone || c.email) && (
                      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12.5, color: CARD_MUTED, margin: '4px 0 0', lineHeight: 1.5 }}>
                        {[c.phone, c.email].filter(Boolean).join('  ·  ')}
                      </p>
                    )}

                    {/* Notes */}
                    {c.notes && (
                      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12.5, fontStyle: 'italic', color: 'rgba(36,28,20,0.62)', margin: `${SPACE_SM}px 0 0`, lineHeight: 1.5 }}>
                        {c.notes}
                      </p>
                    )}

                    {/* Action chips */}
                    {(c.phone || c.email || c.website) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginTop: SPACE_MD, paddingTop: SPACE_SM, borderTop: `1px solid ${CARD_LINE}` }}>
                        {phoneClean && <ActionChip href={`tel:${phoneClean}`} icon={<IconPhone />} label="Call" />}
                        {phoneClean && <ActionChip href={`sms:${phoneClean}`} icon={<IconMessage />} label="Text" />}
                        {c.email && <ActionChip href={`mailto:${c.email}`} icon={<IconMail />} label="Email" />}
                        {c.website && <ActionChip href={normalizeUrl(c.website)} icon={<IconGlobe />} label="Website" external />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Add FAB ── */}
        {!loading && !noCar && (
          <button
            onClick={openNew}
            aria-label="Add contact"
            style={{
              position: 'fixed', right: SPACE_LG, bottom: SPACE_LG,
              width: 56, height: 56, borderRadius: '50%',
              background: COLOR_ACCENT, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.2)',
              zIndex: 20,
            }}
          >
            <span style={{ color: '#fff5dc', fontSize: 30, fontWeight: 300, lineHeight: 1, marginTop: -2 }}>+</span>
          </button>
        )}
      </div>

      {/* ── Add / Edit bottom sheet ── */}
      {draft && (
        <>
          <div
            onClick={() => !saving && setDraft(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, animation: 'backdropIn 200ms ease both' }}
          />
          <div
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 31,
              background: SHEET_BG,
              borderTopLeftRadius: RADIUS_BOTTOM_SHEET, borderTopRightRadius: RADIUS_BOTTOM_SHEET,
              maxHeight: '90dvh', overflowY: 'auto',
              padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_XL}px`,
              boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
              animation: `sheetUp 320ms ${EASING_SETTLE} both`,
            }}
          >
            {/* Grab handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,228,200,0.25)', margin: '0 auto 14px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE_MD }}>
              <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: '#f0e4c8' }}>
                {draft.id ? 'Edit Contact' : 'New Contact'}
              </span>
              <button onClick={() => !saving && setDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.5)' }}>
                Cancel
              </button>
            </div>

            {/* Label (required) + quick-pick chips */}
            <FieldLabel>Label *</FieldLabel>
            <input
              ref={labelInputRef}
              value={draft.label}
              onChange={e => setDraft({ ...draft, label: e.target.value })}
              placeholder="Mechanic, Tuner, Insurance…"
              style={sheetInput}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginTop: SPACE_SM, marginBottom: SPACE_MD }}>
              {LABEL_SUGGESTIONS.map(s => {
                const active = draft.label.trim().toLowerCase() === s.toLowerCase()
                return (
                  <button
                    key={s}
                    onClick={() => setDraft({ ...draft, label: s })}
                    style={{
                      padding: '6px 12px',
                      background: active ? COLOR_ACCENT : 'rgba(240,228,200,0.06)',
                      border: `1px solid ${active ? COLOR_ACCENT : 'rgba(240,228,200,0.18)'}`,
                      color: active ? '#fff5dc' : 'rgba(240,228,200,0.7)',
                      fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em',
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>

            <FieldLabel>Name</FieldLabel>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Mike's Performance" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Phone</FieldLabel>
            <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} placeholder="(555) 123-4567" inputMode="tel" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Email</FieldLabel>
            <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="shop@example.com" inputMode="email" autoCapitalize="none" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Website</FieldLabel>
            <input value={draft.website} onChange={e => setDraft({ ...draft, website: e.target.value })} placeholder="example.com" inputMode="url" autoCapitalize="none" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <FieldLabel>Notes</FieldLabel>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Ask for Dave · closed Mondays · cash only…" rows={3} style={{ ...sheetInput, resize: 'none', marginBottom: SPACE_LG }} />

            {/* Actions */}
            <button
              onClick={save}
              disabled={saving}
              style={{
                width: '100%', minHeight: 48,
                background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer',
                color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Add Contact'}
            </button>

            {draft.id && (
              <button
                onClick={remove}
                disabled={saving}
                style={{
                  width: '100%', minHeight: 44, marginTop: SPACE_SM,
                  background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer',
                  color: '#d27a5e', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                }}
              >
                Delete Contact
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sheet form helpers ──────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.45)', marginBottom: 5 }}>
      {children}
    </label>
  )
}

const sheetInput: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(240,228,200,0.05)',
  border: 'none',
  borderBottom: '1px solid rgba(240,228,200,0.22)',
  padding: '10px 10px',
  fontFamily: FONT_UI, fontWeight: 500, fontSize: 15,
  color: '#f0e4c8',
  outline: 'none',
  borderRadius: 0,
}
