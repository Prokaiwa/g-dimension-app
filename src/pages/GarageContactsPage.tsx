// Route: /garage/contacts — Contacts (per-USER contact book, cross-car) (Part 10)
//
// Aesthetic: "The Little Black Book" — a leather address book. Contacts belong
// to the owner, not a single car (insurance, dealership, roadside, mechanic),
// so this reads from user_contacts (migration 035), not car_contacts.
// Laid out like a real contacts app: avatars, alphabetical letter dividers,
// tap-to-expand Call / Text / Email / Web actions, a bottom search bar, and an
// elevated empty state with quick-add tiles.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reportActionError } from '../lib/appError'
import BottomSheet, { FieldLabel, sheetInput } from '../components/BottomSheet'
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
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
  EASING_SETTLE,
  COLOR_ERROR,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const SHEET_BG  = '#1a140f'
const CARD_INK  = '#241c14'

const LABEL_SUGGESTIONS = ['Mechanic', 'Tuner', 'Body Shop', 'Detailer', 'Insurance', 'Roadside', 'Dealership', 'Parts', 'Other']
// Quick-add tiles for the empty state
const QUICK_ADD = ['Mechanic', 'Insurance', 'Dealership', 'Roadside', 'Tuner', 'Body Shop']

type Contact = {
  id: string
  label: string
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  social: string | null
  notes: string | null
  display_order: number
}

type Draft = {
  id?: string
  label: string
  name: string
  phone: string
  email: string
  website: string
  social: string
  notes: string
}
const EMPTY_DRAFT: Draft = { label: '', name: '', phone: '', email: '', website: '', social: '', notes: '' }

function normalizeUrl(url: string): string {
  const u = url.trim()
  if (!u) return ''
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

// Light, non-destructive phone formatting. US/NANP 10-digit numbers get the
// familiar (555) 123-4567 grouping. Anything with a leading + (explicit country
// code) or a non-US national format (leading trunk 0, or >10 digits) is left
// exactly as typed — so AU/NZ/UK/JP numbers are never mangled.
function formatPhone(input: string): string {
  if (input.trimStart().startsWith('+')) return input
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('0') || digits.length > 10) return input
  const a = digits.slice(0, 3), b = digits.slice(3, 6), c = digits.slice(6, 10)
  if (digits.length > 6) return `(${a}) ${b}-${c}`
  if (digits.length > 3) return `(${a}) ${b}`
  if (digits.length > 0) return `(${a}`
  return ''
}

function displayName(c: Contact): string {
  return (c.name && c.name.trim()) || c.label || '—'
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// ── Stroke icons ──────────────────────────────────────────────────────
function IconPhone({ c = '#fff5dc' }: { c?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>
}
function IconMessage({ c = CARD_INK }: { c?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
}
function IconMail({ c = CARD_INK }: { c?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="0" /><path d="m22 6-10 7L2 6" /></svg>
}
function IconGlobe({ c = CARD_INK }: { c?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" /></svg>
}
function IconAt({ c = CARD_INK }: { c?: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>
}

// Action chip in the expanded row
function ActionChip({ href, icon, label, external, filled }: { href: string; icon: React.ReactNode; label: string; external?: boolean; filled?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} onClick={e => e.stopPropagation()} style={{
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 38, padding: '0 14px', flex: 1, justifyContent: 'center',
      background: filled ? COLOR_ACCENT : 'rgba(240,228,200,0.06)',
      border: `1px solid ${filled ? COLOR_ACCENT : 'rgba(240,228,200,0.16)'}`,
      textDecoration: 'none', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
      color: filled ? '#fff5dc' : '#f0e4c8', WebkitTapHighlightColor: 'transparent',
    }}>
      {icon}<span>{label}</span>
    </a>
  )
}

export default function GarageContactsPage() {
  const navigate = useNavigate()
  const [userId, setUserId]     = useState<string | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [draft, setDraft]   = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth?.user?.id
      if (!uid) { setLoading(false); return }
      setUserId(uid)
      const { data: rows } = await supabase
        .from('user_contacts')
        .select('id, label, name, phone, email, website, social, notes, display_order')
        .eq('user_id', uid)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true })
      setContacts((rows ?? []) as Contact[])
      setLoading(false)
    }
    load()
  }, [])

  // Filter + sort + group by first letter
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = contacts.filter(c => {
      if (!q) return true
      return [c.name, c.label, c.phone, c.email, c.notes].some(v => v && v.toLowerCase().includes(q))
    })
    filtered.sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }))
    const out: { letter: string; items: Contact[] }[] = []
    for (const c of filtered) {
      const ltr = displayName(c)[0]?.toUpperCase() ?? '#'
      const key = /[A-Z]/.test(ltr) ? ltr : '#'
      const last = out[out.length - 1]
      if (last && last.letter === key) last.items.push(c)
      else out.push({ letter: key, items: [c] })
    }
    return out
  }, [contacts, query])

  function openNew(prefillLabel?: string) {
    setDraft({ ...EMPTY_DRAFT, label: prefillLabel ?? '' })
  }
  function openEdit(c: Contact) {
    setDraft({ id: c.id, label: c.label ?? '', name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', website: c.website ?? '', social: c.social ?? '', notes: c.notes ?? '' })
  }

  async function save() {
    if (!draft || !userId) return
    const label = draft.label.trim()
    if (!label) { labelInputRef.current?.focus(); return }
    setSaving(true)
    const payload = {
      label,
      name: draft.name.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null,
      website: normalizeUrl(draft.website) || null,
      social: normalizeUrl(draft.social) || null,
      notes: draft.notes.trim() || null,
    }
    const SEL = 'id, label, name, phone, email, website, social, notes, display_order'
    if (draft.id) {
      const { data, error } = await supabase.from('user_contacts').update(payload).eq('id', draft.id).select(SEL).single()
      // On failure keep the sheet open so the typed data isn't lost.
      if (error || !data) { reportActionError("Couldn't save the contact", error); setSaving(false); return }
      setContacts(prev => prev.map(c => (c.id === draft.id ? (data as Contact) : c)))
    } else {
      const { data, error } = await supabase.from('user_contacts').insert({ ...payload, user_id: userId, display_order: contacts.length }).select(SEL).single()
      if (error || !data) { reportActionError("Couldn't save the contact", error); setSaving(false); return }
      setContacts(prev => [...prev, data as Contact])
    }
    setSaving(false)
    setDraft(null)
  }

  async function remove() {
    if (!draft?.id) return
    setSaving(true)
    const { error } = await supabase.from('user_contacts').delete().eq('id', draft.id)
    if (error) { reportActionError("Couldn't delete the contact", error); setSaving(false); return }
    setContacts(prev => prev.filter(c => c.id !== draft.id))
    setSaving(false)
    setDraft(null)
  }

  const hasContacts = contacts.length > 0

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse 120% 80% at 50% 0%, #241c16 0%, #17110c 55%, #0c0907 100%)', fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes contactRowIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .contacts-search::placeholder { color: rgba(240,228,200,0.4); }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/garage')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Contacts</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_M, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%' }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(240,228,200,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {/* Elevated empty state */}
        {!loading && !hasContacts && (
          <div style={{ padding: `${SPACE_XL}px ${SPACE_MD}px ${SPACE_XL * 2}px` }}>
            <div style={{ textAlign: 'center', marginBottom: SPACE_XL }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', border: '1.5px solid rgba(240,228,200,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(240,228,200,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 21a8 8 0 0 1 13.292-6"/><circle cx="10" cy="8" r="5"/><path d="M19 16v6M16 19h6"/></svg>
              </div>
              <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: '#f0e4c8', margin: '0 0 6px' }}>Your address book</p>
              <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(240,228,200,0.5)', margin: 0, lineHeight: 1.5 }}>
                Keep your people in one place — across every car you own.
              </p>
            </div>
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.4)', margin: `0 0 ${SPACE_SM}px ${SPACE_XS}px` }}>Quick add</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE_SM }}>
              {QUICK_ADD.map(label => (
                <button key={label} onClick={() => openNew(label)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px',
                  background: 'linear-gradient(180deg, #f6f1e6 0%, #ece4d4 100%)', border: 'none', borderLeft: `4px solid ${COLOR_ACCENT}`,
                  boxShadow: '0 2px 5px rgba(0,0,0,0.4)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 18, color: COLOR_ACCENT, lineHeight: 1 }}>+</span>
                  <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: CARD_INK, textAlign: 'left' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact list */}
        {!loading && hasContacts && (
          <div style={{ padding: `${SPACE_SM}px 0 96px` }}>
            {groups.length === 0 && (
              <div style={{ padding: `${SPACE_XL}px ${SPACE_MD}px`, textAlign: 'center' }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(240,228,200,0.45)' }}>No matches for "{query}"</span>
              </div>
            )}
            {groups.map((g, gi) => (
              <div key={g.letter}>
                <div style={{ padding: `${SPACE_SM}px ${SPACE_MD}px 4px`, fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.18em', color: COLOR_ACCENT_DIM }}>{g.letter}</div>
                {g.items.map((c, i) => {
                  const open = expandedId === c.id
                  const dn = displayName(c)
                  const phoneClean = c.phone ? c.phone.replace(/[^\d+]/g, '') : ''
                  return (
                    <div key={c.id} style={{ borderBottom: '1px solid rgba(240,228,200,0.06)', animation: `contactRowIn 320ms ${EASING_SETTLE} ${(gi * 3 + i) * 30}ms both` }}>
                      <button onClick={() => setExpandedId(open ? null : c.id)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: `11px ${SPACE_MD}px`,
                        background: open ? 'rgba(240,228,200,0.04)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                      }}>
                        {/* Avatar */}
                        <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', background: 'rgba(200,102,26,0.16)', border: '1px solid rgba(200,102,26,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 14, color: COLOR_ACCENT, letterSpacing: '0.02em' }}>{initials(dn)}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15.5, color: '#f0e4c8', margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dn}</p>
                          <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: 'rgba(240,228,200,0.5)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[c.name ? c.label : null, c.phone].filter(Boolean).join('  ·  ') || c.label}
                          </p>
                        </div>
                        <span style={{ flexShrink: 0, color: 'rgba(240,228,200,0.35)', fontSize: 18, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 200ms ease' }}>›</span>
                      </button>
                      {open && (
                        <div style={{ padding: `0 ${SPACE_MD}px ${SPACE_MD}px 70px` }}>
                          {c.notes && (
                            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12.5, fontStyle: 'italic', color: 'rgba(240,228,200,0.55)', margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.5 }}>{c.notes}</p>
                          )}
                          <div style={{ display: 'flex', gap: SPACE_XS, flexWrap: 'wrap' }}>
                            {phoneClean && <ActionChip href={`tel:${phoneClean}`} icon={<IconPhone />} label="Call" filled />}
                            {phoneClean && <ActionChip href={`sms:${phoneClean}`} icon={<IconMessage c="#f0e4c8" />} label="Text" />}
                            {c.email && <ActionChip href={`mailto:${c.email}`} icon={<IconMail c="#f0e4c8" />} label="Email" />}
                            {c.website && <ActionChip href={normalizeUrl(c.website)} icon={<IconGlobe c="#f0e4c8" />} label="Web" external />}
                            {c.social && <ActionChip href={normalizeUrl(c.social)} icon={<IconAt c="#f0e4c8" />} label="Social" external />}
                          </div>
                          <button onClick={() => openEdit(c)} style={{ marginTop: SPACE_SM, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.45)' }}>Edit contact</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom search + add toolbar ── */}
      {!loading && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: SPACE_SM, padding: `${SPACE_SM}px ${SPACE_MD}px calc(${SPACE_SM}px + env(safe-area-inset-bottom))`, background: 'rgba(12,9,7,0.92)', borderTop: '1px solid rgba(240,228,200,0.08)', backdropFilter: 'blur(8px)' }}>
        {hasContacts && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', background: 'rgba(240,228,200,0.06)', border: '1px solid rgba(240,228,200,0.14)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(240,228,200,0.45)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input className="contacts-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search contacts" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: '#f0e4c8' }} />
            {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240,228,200,0.5)', fontSize: 16, padding: 0 }}>×</button>}
          </div>
        )}
        <button onClick={() => openNew()} aria-label="Add contact" style={{
          flexShrink: 0, width: 40, height: 40, borderRadius: '50%', background: COLOR_ACCENT, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', marginLeft: hasContacts ? 0 : 'auto',
        }}>
          <span style={{ color: '#fff5dc', fontSize: 24, fontWeight: 300, lineHeight: 1, marginTop: -2 }}>+</span>
        </button>
        </div>
      )}

      {/* ── Add / Edit sheet ── */}
      <BottomSheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit Contact' : 'New Contact'} bg={SHEET_BG} busy={saving}>
        {draft && (
          <>
            <FieldLabel>Label *</FieldLabel>
            <input ref={labelInputRef} value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Mechanic, Insurance, Dealership…" style={sheetInput} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginTop: SPACE_SM, marginBottom: SPACE_MD }}>
              {LABEL_SUGGESTIONS.map(s => {
                const active = draft.label.trim().toLowerCase() === s.toLowerCase()
                return (
                  <button key={s} onClick={() => setDraft({ ...draft, label: s })} style={{
                    padding: '6px 12px', background: active ? COLOR_ACCENT : 'rgba(240,228,200,0.06)',
                    border: `1px solid ${active ? COLOR_ACCENT : 'rgba(240,228,200,0.18)'}`,
                    color: active ? '#fff5dc' : 'rgba(240,228,200,0.7)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', cursor: 'pointer',
                  }}>{s}</button>
                )
              })}
            </div>

            <FieldLabel>Name</FieldLabel>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Mike's Performance" style={{ ...sheetInput, marginBottom: SPACE_MD }} />
            <FieldLabel>Phone</FieldLabel>
            <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: formatPhone(e.target.value) })} placeholder="(555) 123-4567" inputMode="tel" style={{ ...sheetInput }} />
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: 'rgba(240,228,200,0.4)', margin: `6px 0 ${SPACE_MD}px`, lineHeight: 1.4 }}>
              Outside the US? Start with your country code (e.g. +61, +44, +81).
            </p>
            <FieldLabel>Email</FieldLabel>
            <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="shop@example.com" inputMode="email" autoCapitalize="none" style={{ ...sheetInput, marginBottom: SPACE_MD }} />
            <FieldLabel>Website</FieldLabel>
            <input value={draft.website} onChange={e => setDraft({ ...draft, website: e.target.value })} placeholder="example.com" inputMode="url" autoCapitalize="none" style={{ ...sheetInput, marginBottom: SPACE_MD }} />
            <FieldLabel>Social</FieldLabel>
            <input value={draft.social} onChange={e => setDraft({ ...draft, social: e.target.value })} placeholder="instagram.com/yourshop" inputMode="url" autoCapitalize="none" style={{ ...sheetInput, marginBottom: SPACE_MD }} />
            <FieldLabel>Notes</FieldLabel>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Ask for Dave · closed Mondays · cash only…" rows={3} style={{ ...sheetInput, resize: 'none', marginBottom: SPACE_LG }} />

            <button onClick={save} disabled={saving} style={{ width: '100%', minHeight: 48, background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer', color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Add Contact'}
            </button>
            {draft.id && (
              <button onClick={remove} disabled={saving} style={{ width: '100%', minHeight: 44, marginTop: SPACE_SM, background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer', color: COLOR_ERROR, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Delete Contact
              </button>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  )
}
