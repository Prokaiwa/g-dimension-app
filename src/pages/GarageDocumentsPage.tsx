// Route: /garage/documents — Documentation (registration, insurance, title…) (Part 10)
//
// Aesthetic: "The Document Vault" — a dark, secure surface that signals these
// are PRIVATE records (VIN, insurance, registration). Files live in the
// car-documents PRIVATE bucket: file_url stores the storage PATH only, and
// every view goes through a short-lived createSignedUrl() — never a public URL.
// Documents render as official paper cards with a doc-type band and a prominent
// expiry stamp (EXPIRED / EXPIRES SOON) that feeds the Snapshot.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
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

// Vault palette
const VAULT_BG = 'radial-gradient(ellipse 130% 90% at 50% -5%, #181a1e 0%, #0d0e10 55%, #070708 100%)'
const PAPER    = 'linear-gradient(180deg, #efe9db 0%, #e4ddca 100%)'
const PAPER_INK   = '#1f1a12'
const PAPER_MUTED = 'rgba(31,26,18,0.5)'
const PAPER_LINE  = 'rgba(31,26,18,0.12)'
const CREAM    = '#f0e4c8'
const DIM      = 'rgba(240,228,200,0.4)'
const FAINT    = 'rgba(240,228,200,0.16)'
const SHEET_BG = '#121316'

const EXPIRE_SOON_DAYS = 60

const DOC_TYPES = ['registration', 'insurance', 'title', 'emissions', 'inspection', 'warranty', 'purchase', 'other'] as const
type DocType = typeof DOC_TYPES[number]
const DOC_TYPE_LABEL: Record<DocType, string> = {
  registration: 'Registration', insurance: 'Insurance', title: 'Title', emissions: 'Emissions',
  inspection: 'Inspection', warranty: 'Warranty', purchase: 'Purchase', other: 'Other',
}

type Doc = {
  id: string
  doc_type: DocType
  label: string | null
  file_url: string | null      // storage PATH (private bucket)
  file_type: 'image' | 'pdf' | null
  file_name: string | null
  issued_date: string | null
  expiry_date: string | null
}

type Draft = {
  id?: string
  doc_type: DocType
  label: string
  issued_date: string
  expiry_date: string
  file: File | null            // new file to upload (null = keep existing)
  existingFileName: string | null
}

const EMPTY_DRAFT: Draft = { doc_type: 'registration', label: '', issued_date: '', expiry_date: '', file: null, existingFileName: null }

type ExpiryStatus = 'expired' | 'soon' | 'ok' | null
function expiryStatus(expiry: string | null): ExpiryStatus {
  if (!expiry) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(expiry + 'T00:00:00')
  const days = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= EXPIRE_SOON_DAYS) return 'soon'
  return 'ok'
}

function fmtDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d + 'T00:00:00')
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

// Open a document via a fresh short-lived signed URL (private bucket).
async function openDocument(path: string | null) {
  if (!path) return
  const { data } = await supabase.storage.from('car-documents').createSignedUrl(path, 120)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

export default function GarageDocumentsPage() {
  const navigate = useNavigate()
  const [carId, setCarId]   = useState<string | null>(null)
  const [carInfo, setCarInfo] = useState<string | null>(null)
  const [docs, setDocs]     = useState<Doc[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})  // doc.id → signed image URL
  const [loading, setLoading] = useState(true)
  const [noCar, setNoCar]   = useState(false)

  const [draft, setDraft]   = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const id = await getActiveCarId()
      if (!id) { setLoading(false); setNoCar(true); return }
      setCarId(id)

      const [{ data: car }, { data: rows }] = await Promise.all([
        supabase.from('cars').select('year, model').eq('id', id).is('deleted_at', null).single(),
        supabase
          .from('car_documents')
          .select('id, doc_type, label, file_url, file_type, file_name, issued_date, expiry_date')
          .eq('car_id', id)
          .order('expiry_date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ])

      if (car) setCarInfo([car.year, car.model].filter(Boolean).join(' '))
      const list = (rows ?? []) as Doc[]
      setDocs(list)
      setLoading(false)

      // Sign thumbnails for image docs (PDFs use a glyph).
      const imageRows = list.filter(d => d.file_type === 'image' && d.file_url)
      const signed = await Promise.all(imageRows.map(async d => {
        const { data } = await supabase.storage.from('car-documents').createSignedUrl(d.file_url as string, 600)
        return [d.id, data?.signedUrl] as const
      }))
      const map: Record<string, string> = {}
      for (const [docId, url] of signed) if (url) map[docId] = url
      setThumbs(map)
    }
    load()
  }, [])

  function openNew() { setDraft({ ...EMPTY_DRAFT }) }
  function openEdit(d: Doc) {
    setDraft({
      id: d.id, doc_type: d.doc_type, label: d.label ?? '',
      issued_date: d.issued_date ?? '', expiry_date: d.expiry_date ?? '',
      file: null, existingFileName: d.file_name,
    })
  }

  async function save() {
    if (!draft || !carId) return
    setSaving(true)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) { setSaving(false); return }

    // Upload a new file if one was picked.
    let fileUrl: string | undefined
    let fileType: 'image' | 'pdf' | undefined
    let fileName: string | undefined
    if (draft.file) {
      const isImg = draft.file.type.startsWith('image/')
      const ext   = isImg ? 'jpg' : 'pdf'
      const path  = `${userId}/${carId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      let upload: File | Blob = draft.file
      if (isImg) {
        try { upload = await imageCompression(draft.file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, fileType: 'image/jpeg' }) } catch { /* use original */ }
      }
      const { error: upErr } = await supabase.storage.from('car-documents').upload(path, upload, { contentType: isImg ? 'image/jpeg' : 'application/pdf' })
      if (upErr) { console.error('Document upload failed:', upErr.message); setSaving(false); return }
      fileUrl = path
      fileType = isImg ? 'image' : 'pdf'
      fileName = draft.file.name
    }

    const base = {
      doc_type: draft.doc_type,
      label: draft.label.trim() || null,
      issued_date: draft.issued_date || null,
      expiry_date: draft.expiry_date || null,
    }
    const SEL = 'id, doc_type, label, file_url, file_type, file_name, issued_date, expiry_date'

    if (draft.id) {
      const payload = fileUrl ? { ...base, file_url: fileUrl, file_type: fileType, file_name: fileName } : base
      // Replacing the file → clean up the now-orphaned storage object.
      if (fileUrl) {
        const old = docs.find(d => d.id === draft.id)?.file_url
        if (old && old !== fileUrl) await supabase.storage.from('car-documents').remove([old])
      }
      const { data, error } = await supabase.from('car_documents').update(payload).eq('id', draft.id).select(SEL).single()
      if (!error && data) {
        const updated = data as Doc
        setDocs(prev => prev.map(d => (d.id === draft.id ? updated : d)))
        if (updated.file_type === 'image' && updated.file_url) {
          const { data: s } = await supabase.storage.from('car-documents').createSignedUrl(updated.file_url, 600)
          if (s?.signedUrl) setThumbs(prev => ({ ...prev, [updated.id]: s.signedUrl }))
        }
      }
    } else {
      const payload = { ...base, car_id: carId, file_url: fileUrl ?? null, file_type: fileType ?? null, file_name: fileName ?? null }
      const { data, error } = await supabase.from('car_documents').insert(payload).select(SEL).single()
      if (!error && data) {
        const created = data as Doc
        setDocs(prev => [created, ...prev])
        if (created.file_type === 'image' && created.file_url) {
          const { data: s } = await supabase.storage.from('car-documents').createSignedUrl(created.file_url, 600)
          if (s?.signedUrl) setThumbs(prev => ({ ...prev, [created.id]: s.signedUrl }))
        }
      }
    }

    setSaving(false)
    setDraft(null)
  }

  async function remove() {
    if (!draft?.id) return
    setSaving(true)
    const doc = docs.find(d => d.id === draft.id)
    if (doc?.file_url) await supabase.storage.from('car-documents').remove([doc.file_url])
    const { error } = await supabase.from('car_documents').delete().eq('id', draft.id)
    if (!error) setDocs(prev => prev.filter(d => d.id !== draft.id))
    setSaving(false)
    setDraft(null)
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: VAULT_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes docIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/garage')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Documents</span>
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

            {/* Private reassurance line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: SPACE_LG }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={DIM} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="0" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', color: DIM }}>
                Private — stored encrypted, opened only with a short-lived link.
              </span>
            </div>

            {/* Empty state */}
            {docs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE_SM, padding: `${SPACE_XL}px 0`, opacity: 0.55 }}>
                <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM }}>No documents yet</span>
                <span style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: DIM }}>Registration, insurance, title… tap + to add.</span>
              </div>
            )}

            {/* Document cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_MD }}>
              {docs.map((d, i) => {
                const status = expiryStatus(d.expiry_date)
                return (
                  <div
                    key={d.id}
                    style={{
                      position: 'relative', display: 'flex',
                      background: PAPER,
                      borderLeft: `4px solid ${COLOR_ACCENT}`,
                      boxShadow: '0 2px 5px rgba(0,0,0,0.5), 0 10px 22px rgba(0,0,0,0.32)',
                      animation: `docIn 420ms ${EASING_SETTLE} ${i * 50}ms both`,
                    }}
                  >
                    {/* Thumbnail / file glyph — tap opens the file */}
                    <button
                      onClick={() => openDocument(d.file_url)}
                      disabled={!d.file_url}
                      style={{
                        flexShrink: 0, width: 72, alignSelf: 'stretch',
                        background: thumbs[d.id] ? `center/cover no-repeat url(${thumbs[d.id]})` : 'rgba(31,26,18,0.06)',
                        border: 'none', borderRight: `1px solid ${PAPER_LINE}`,
                        cursor: d.file_url ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      {!thumbs[d.id] && (
                        d.file_type === 'pdf' ? (
                          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', color: PAPER_MUTED }}>PDF</span>
                        ) : d.file_url ? (
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, color: PAPER_MUTED }}>FILE</span>
                        ) : (
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.06em', color: 'rgba(31,26,18,0.3)', textAlign: 'center', lineHeight: 1.3 }}>NO<br/>FILE</span>
                        )
                      )}
                    </button>

                    {/* Body */}
                    <div style={{ flex: 1, minWidth: 0, padding: `${SPACE_SM + 2}px ${SPACE_MD}px` }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE_SM }}>
                        <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT }}>
                          {DOC_TYPE_LABEL[d.doc_type]}
                        </span>
                        <button onClick={() => openEdit(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: PAPER_MUTED }}>
                          Edit
                        </button>
                      </div>

                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15.5, color: PAPER_INK, margin: '3px 0 0', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label || d.file_name || DOC_TYPE_LABEL[d.doc_type]}
                      </p>

                      {/* Dates + expiry stamp */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_SM, marginTop: 6, flexWrap: 'wrap' }}>
                        {d.issued_date && (
                          <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 11, color: PAPER_MUTED }}>
                            Issued {fmtDate(d.issued_date)}
                          </span>
                        )}
                        {status && status !== 'ok' && (
                          <span style={{
                            fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
                            color: status === 'expired' ? '#fff5dc' : COLOR_ACCENT,
                            background: status === 'expired' ? COLOR_ACCENT : 'transparent',
                            border: `1px solid ${COLOR_ACCENT}`, padding: '2px 6px',
                          }}>
                            {status === 'expired' ? `Expired ${fmtDate(d.expiry_date)}` : `Expires ${fmtDate(d.expiry_date)}`}
                          </span>
                        )}
                        {status === 'ok' && (
                          <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 11, color: PAPER_MUTED }}>
                            Expires {fmtDate(d.expiry_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Add FAB */}
        {!loading && !noCar && (
          <button
            onClick={openNew}
            aria-label="Add document"
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
      {draft && (
        <>
          <div onClick={() => !saving && setDraft(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30, animation: 'backdropIn 200ms ease both' }} />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 31,
            background: SHEET_BG, borderTopLeftRadius: RADIUS_BOTTOM_SHEET, borderTopRightRadius: RADIUS_BOTTOM_SHEET,
            maxHeight: '92dvh', overflowY: 'auto', padding: `${SPACE_MD}px ${SPACE_MD}px ${SPACE_XL}px`,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.6)', animation: `sheetUp 320ms ${EASING_SETTLE} both`,
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(240,228,200,0.25)', margin: '0 auto 14px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE_MD }}>
              <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: CREAM }}>
                {draft.id ? 'Edit Document' : 'New Document'}
              </span>
              <button onClick={() => !saving && setDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM }}>Cancel</button>
            </div>

            <FieldLabel>Type</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginBottom: SPACE_MD }}>
              {DOC_TYPES.map(t => {
                const active = draft.doc_type === t
                return (
                  <button key={t} onClick={() => setDraft({ ...draft, doc_type: t })} style={{
                    padding: '6px 12px',
                    background: active ? COLOR_ACCENT : 'rgba(240,228,200,0.05)',
                    border: `1px solid ${active ? COLOR_ACCENT : FAINT}`,
                    color: active ? '#fff5dc' : 'rgba(240,228,200,0.7)',
                    fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', cursor: 'pointer',
                  }}>{DOC_TYPE_LABEL[t]}</button>
                )
              })}
            </div>

            <FieldLabel>Label</FieldLabel>
            <input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. State Farm Policy 2026" style={{ ...sheetInput, marginBottom: SPACE_MD }} />

            <div style={{ display: 'flex', gap: SPACE_MD }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Issued</FieldLabel>
                <input type="date" value={draft.issued_date} onChange={e => setDraft({ ...draft, issued_date: e.target.value })} style={{ ...sheetInput, colorScheme: 'dark', marginBottom: SPACE_MD }} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Expires</FieldLabel>
                <input type="date" value={draft.expiry_date} onChange={e => setDraft({ ...draft, expiry_date: e.target.value })} style={{ ...sheetInput, colorScheme: 'dark', marginBottom: SPACE_MD }} />
              </div>
            </div>

            {/* File picker */}
            <FieldLabel>File (image or PDF)</FieldLabel>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={e => setDraft({ ...draft, file: e.target.files?.[0] ?? null })}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', minHeight: 48, marginBottom: SPACE_LG,
                background: 'rgba(240,228,200,0.05)', border: `1px dashed ${FAINT}`, cursor: 'pointer',
                fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: CREAM,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 14px',
              }}
            >
              <span style={{ color: COLOR_ACCENT, fontSize: 16 }}>＋</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft.file ? draft.file.name : draft.existingFileName ? `Replace — ${draft.existingFileName}` : 'Choose a file…'}
              </span>
            </button>

            <button onClick={save} disabled={saving} style={{
              width: '100%', minHeight: 48, background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer',
              color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Add Document'}</button>

            {draft.id && (
              <button onClick={remove} disabled={saving} style={{
                width: '100%', minHeight: 44, marginTop: SPACE_SM, background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer',
                color: '#d27a5e', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Delete Document</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(240,228,200,0.45)', marginBottom: 5 }}>
      {children}
    </label>
  )
}

const sheetInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(240,228,200,0.05)', border: 'none', borderBottom: '1px solid rgba(240,228,200,0.22)',
  padding: '10px 10px', fontFamily: FONT_UI, fontWeight: 500, fontSize: 15, color: '#f0e4c8', outline: 'none', borderRadius: 0,
}
