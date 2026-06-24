// Route: /garage/documents — Documentation + Receipts (Part 10)
//
// Aesthetic: "The Document Vault" — a dark, secure surface that signals these
// are PRIVATE records (VIN, insurance, registration). Files live in the
// car-documents PRIVATE bucket: file_url stores the storage PATH only, and
// every view goes through a short-lived createSignedUrl() — never a public URL.
//
// Two tabs:
//   Documents — registration, insurance, title… (car_documents, editable).
//   Receipts  — standalone titled receipts the owner adds (car_documents,
//               doc_type='receipt', e.g. insurance/registration fees) PLUS
//               read-only build receipts pulled from public.receipts (service
//               + part purchases). Build receipts open from the private
//               `receipts` bucket; standalone ones from `car-documents`.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
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
  COLOR_ERROR,
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

// Document types shown as chips in the document sheet (receipts have their own flow).
const DOC_TYPES = ['registration', 'insurance', 'title', 'emissions', 'inspection', 'warranty', 'purchase', 'other'] as const
type DocType = typeof DOC_TYPES[number] | 'receipt'
const DOC_TYPE_LABEL: Record<DocType, string> = {
  registration: 'Registration', insurance: 'Insurance', title: 'Title', emissions: 'Emissions',
  inspection: 'Inspection', warranty: 'Warranty', purchase: 'Purchase', receipt: 'Receipt', other: 'Other',
}

// Contextual placeholder for the Label field, per document type.
const LABEL_PLACEHOLDER: Record<DocType, string> = {
  registration: 'e.g. 2026 tags · plate ABC-123',
  insurance: 'e.g. State Farm Policy 2026',
  title: 'e.g. Pink slip / title',
  emissions: 'e.g. Smog certificate',
  inspection: 'e.g. Safety inspection',
  warranty: 'e.g. Powertrain warranty',
  purchase: 'e.g. Bill of sale',
  receipt: 'e.g. Insurance payment — June',
  other: 'e.g. Document name',
}

// Map a doc type to a car_reminders.category (its CHECK is narrower than ours).
const DOCTYPE_TO_REMINDER: Record<DocType, string> = {
  registration: 'registration', insurance: 'insurance', emissions: 'emissions',
  inspection: 'inspection', warranty: 'warranty',
  title: 'other', purchase: 'other', receipt: 'other', other: 'other',
}

// Expiry-reminder lead-time presets (days before expiry). 0 = no reminder.
const REMIND_PRESETS: { label: string; days: number }[] = [
  { label: 'No reminder', days: 0 },
  { label: '2 weeks',     days: 14 },
  { label: '1 month',     days: 30 },
  { label: '3 months',    days: 90 },
]

// Snap a stored lead time (days) to the nearest available preset.
function snapPreset(days: number | null | undefined): number {
  if (!days || days <= 0) return 0
  if (days <= 18) return 14
  if (days <= 60) return 30
  return 90
}

type Tab = 'documents' | 'receipts'

// In-app detail panel state
type DetailItem =
  | { kind: 'doc'; doc: Doc }
  | { kind: 'buildReceipt'; receipt: BuildReceipt }

type Doc = {
  id: string
  doc_type: DocType
  label: string | null
  file_url: string | null      // storage PATH (private bucket)
  file_type: 'image' | 'pdf' | null
  file_name: string | null
  issued_date: string | null
  expiry_date: string | null
  amount: number | null        // standalone receipts only (pre-036: undefined → treated null)
  currency: string | null
}

// Read-only receipts from public.receipts (service + part purchases).
type BuildReceipt = {
  id: string
  job_id: string | null        // null = session/service-level, set = part-level
  session_id: string | null
  file_url: string | null      // storage PATH (private `receipts` bucket)
  file_type: 'image' | 'pdf' | null
  file_name: string | null
  amount: number | null
  currency: string | null
  vendor: string | null
  receipt_date: string | null
  created_at: string | null
}

type Draft = {
  id?: string
  kind: 'document' | 'receipt'
  doc_type: DocType
  label: string
  issued_date: string
  expiry_date: string
  amount: string               // receipts only
  remindDays: number           // documents only — 0 = no expiry reminder
  file: File | null            // new file to upload (null = keep existing)
  existingFileName: string | null
}

const EMPTY_DOC: Draft = { kind: 'document', doc_type: 'registration', label: '', issued_date: '', expiry_date: '', amount: '', remindDays: 0, file: null, existingFileName: null }
const EMPTY_RECEIPT: Draft = { kind: 'receipt', doc_type: 'receipt', label: '', issued_date: '', expiry_date: '', amount: '', remindDays: 0, file: null, existingFileName: null }

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
  // If it looks like a plain date (YYYY-MM-DD), append time to avoid UTC shift.
  // Full ISO timestamps (created_at) are parsed directly.
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d)
  if (isNaN(dt.getTime())) return null
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`
}

function fmtMoney(amount: number | null, currency: string | null): string | null {
  if (amount == null) return null
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `$${amount.toLocaleString()}`
  }
}

// Open a file via a fresh short-lived signed URL (private buckets).
// The window MUST be opened synchronously inside the tap handler — opening it
// after the `await` loses the user-gesture context and mobile Safari blocks it
// (this was the "nothing happens" bug). We open a blank tab first, then point it
// at the signed URL once it resolves.
async function openSigned(bucket: 'car-documents' | 'receipts', path: string | null) {
  if (!path) return
  const win = window.open('', '_blank')
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 120)
  if (data?.signedUrl) {
    if (win) win.location.href = data.signedUrl
    else window.open(data.signedUrl, '_blank')   // fallback if the blank open was blocked
  } else if (win) {
    win.close()
  }
}

const DOC_SEL_FULL = 'id, doc_type, label, file_url, file_type, file_name, issued_date, expiry_date, amount, currency'
const DOC_SEL_BASE = 'id, doc_type, label, file_url, file_type, file_name, issued_date, expiry_date'

export default function GarageDocumentsPage() {
  const navigate = useNavigate()
  const [carId, setCarId]   = useState<string | null>(null)
  const [carInfo, setCarInfo] = useState<string | null>(null)
  const [tab, setTab]       = useState<Tab>('documents')
  const [docs, setDocs]     = useState<Doc[]>([])             // doc_type !== 'receipt'
  const [receiptDocs, setReceiptDocs] = useState<Doc[]>([])   // doc_type === 'receipt'
  const [buildReceipts, setBuildReceipts] = useState<BuildReceipt[]>([])
  const [jobTitleMap, setJobTitleMap] = useState<Record<string, string>>({})
  const [sessionInfoMap, setSessionInfoMap] = useState<Record<string, { label: string; date: string | null; shop: string | null; items: string[]; notes: string | null }>>({}) // session_id → display label + date + service items
  const [thumbs, setThumbs] = useState<Record<string, string>>({})        // car_documents id → signed image URL
  const [thumbLoaded, setThumbLoaded] = useState<Set<string>>(new Set())  // ids whose thumb has finished loading
  const [loading, setLoading] = useState(true)
  const [noCar, setNoCar]   = useState(false)

  const [draft, setDraft]   = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // In-app detail panel
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)
  const [detailSignedUrl, setDetailSignedUrl] = useState<string | null>(null)
  const [detailUrlLoading, setDetailUrlLoading] = useState(false)
  // doc id → linked expiry reminder lead time (days), for prefilling the edit sheet
  const [docReminders, setDocReminders] = useState<Record<string, number>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Helper: sign a thumbnail URL with image transform (144×144 cover for 72px @2x).
  // Falls back to plain signed URL if the transform call errors or returns no URL.
  async function signThumb(path: string): Promise<string | null> {
    try {
      const { data: t } = await supabase.storage
        .from('car-documents')
        .createSignedUrl(path, 600, { transform: { width: 144, height: 144, resize: 'cover' } })
      if (t?.signedUrl) return t.signedUrl
    } catch { /* transform not supported on this tier */ }
    const { data: plain } = await supabase.storage.from('car-documents').createSignedUrl(path, 600)
    return plain?.signedUrl ?? null
  }

  async function loadData() {
    const id = await getActiveCarId()
    if (!id) { setLoading(false); setNoCar(true); return }
    setCarId(id)

    // car_documents — try the post-036 columns, fall back if amount/currency
    // don't exist yet (brief window before the migration is applied).
    const carP = supabase.from('cars').select('year, model').eq('id', id).is('deleted_at', null).single()
    const recP = supabase
      .from('receipts')
      .select('id, job_id, session_id, file_url, file_type, file_name, amount, currency, vendor, receipt_date, created_at')
      .eq('car_id', id)
      .order('receipt_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    const fullRes = await supabase
      .from('car_documents').select(DOC_SEL_FULL)
      .eq('car_id', id)
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    let docRows: unknown[] | null = fullRes.data
    if (fullRes.error) {
      const baseRes = await supabase
        .from('car_documents').select(DOC_SEL_BASE)
        .eq('car_id', id)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      docRows = baseRes.data
    }

    const [{ data: car }, { data: receiptRows }] = await Promise.all([carP, recP])

    if (car) setCarInfo([car.year, car.model].filter(Boolean).join(' '))
    const all = (docRows ?? []) as Doc[]
    setDocs(all.filter(d => d.doc_type !== 'receipt'))
    const sorted = all
      .filter(d => d.doc_type === 'receipt')
      .sort((a, b) =>
        (b.issued_date ?? '').localeCompare(a.issued_date ?? '') ||
        ((b as unknown as { created_at?: string }).created_at ?? '').localeCompare(
          (a as unknown as { created_at?: string }).created_at ?? ''
        )
      )
    setReceiptDocs(sorted)
    setBuildReceipts((receiptRows ?? []) as BuildReceipt[])
    setLoading(false)

    // Kick off thumbnail signing and reminders query in parallel — thumbnails
    // no longer wait for the reminders round-trip.
    const imageRows = all.filter(d => d.file_type === 'image' && d.file_url)
    const thumbP = Promise.all(imageRows.map(async d => {
      const url = await signThumb(d.file_url as string)
      return [d.id, url] as const
    }))

    // Map document-linked expiry reminders (lead time) so the edit sheet can prefill.
    // Resilient to the pre-038 schema (remind_days_before may not exist yet).
    let remRows: { document_id: string; remind_days_before: number | null }[] | null = null
    const remFull = await supabase
      .from('car_reminders').select('document_id, remind_days_before')
      .eq('car_id', id).not('document_id', 'is', null)
    if (remFull.error) {
      const remBase = await supabase
        .from('car_reminders').select('document_id')
        .eq('car_id', id).not('document_id', 'is', null)
      remRows = (remBase.data ?? []).map(r => ({ document_id: (r as { document_id: string }).document_id, remind_days_before: null }))
    } else {
      remRows = remFull.data as { document_id: string; remind_days_before: number | null }[]
    }
    const remMap: Record<string, number> = {}
    for (const r of remRows ?? []) remMap[r.document_id] = snapPreset(r.remind_days_before)
    setDocReminders(remMap)

    // Apply thumbnails when ready (parallel with reminders — resolves independently).
    // Preload each image so we only reveal when the browser has the pixels — prevents
    // the background-image pop. Fade-in is handled by opacity transition on each thumb.
    const signed = await thumbP
    for (const [docId, url] of signed) {
      if (!url) continue
      const img = new Image()
      img.onload = () => {
        setThumbs(prev => ({ ...prev, [docId]: url }))
        setThumbLoaded(prev => { const n = new Set(prev); n.add(docId); return n })
      }
      img.onerror = () => {
        // Still set the URL so background renders (network may succeed later)
        setThumbs(prev => ({ ...prev, [docId]: url }))
        setThumbLoaded(prev => { const n = new Set(prev); n.add(docId); return n })
      }
      img.src = url
    }
  }

  useEffect(() => { loadData() }, [])

  // Load signed URL for the detail panel image
  useEffect(() => {
    setDetailSignedUrl(null)
    if (!detailItem) return
    const bucket = detailItem.kind === 'buildReceipt' ? 'receipts' : 'car-documents'
    const path = detailItem.kind === 'buildReceipt' ? detailItem.receipt.file_url : detailItem.doc.file_url
    const fileType = detailItem.kind === 'buildReceipt' ? detailItem.receipt.file_type : detailItem.doc.file_type
    if (!path || fileType !== 'image') return
    setDetailUrlLoading(true)
    supabase.storage.from(bucket).createSignedUrl(path, 300).then(({ data }) => {
      setDetailUrlLoading(false)
      if (data?.signedUrl) setDetailSignedUrl(data.signedUrl)
    })
  }, [detailItem])

  function openDetailPdf() {
    if (!detailItem) return
    const bucket = detailItem.kind === 'buildReceipt' ? 'receipts' : 'car-documents'
    const path = detailItem.kind === 'buildReceipt' ? detailItem.receipt.file_url : detailItem.doc.file_url
    openSigned(bucket, path)
  }

  // Fetch job titles + session info for build receipts
  useEffect(() => {
    let cancelled = false
    const jobIds = buildReceipts.map(r => r.job_id).filter((id): id is string => !!id)
    const sessionIds = buildReceipts.map(r => r.session_id).filter((id): id is string => !!id)

    const jobP = jobIds.length > 0
      ? supabase.from('jobs').select('id, title, part_types(name)').in('id', jobIds)
      : Promise.resolve({ data: [] as { id: string; title: unknown; part_types: unknown }[] })

    const sessP = sessionIds.length > 0
      ? supabase.from('sessions').select('id, title, type, date_performed, shop_name, notes').in('id', sessionIds)
      : Promise.resolve({ data: [] as { id: string; title: unknown; type: unknown; date_performed: unknown; shop_name: unknown; notes: unknown }[] })

    // Service items (jobs) belonging to those sessions — the "what was done".
    const sessJobsP = sessionIds.length > 0
      ? supabase.from('jobs').select('session_id, title').in('session_id', sessionIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as { session_id: string; title: unknown }[] })

    Promise.all([jobP, sessP, sessJobsP]).then(([{ data: jobs }, { data: sessions }, { data: sessJobs }]) => {
      if (cancelled) return
      const jMap: Record<string, string> = {}
      for (const j of jobs ?? []) {
        const pt = (j.part_types as { name?: string } | null)?.name
        jMap[j.id] = (j.title as string | null) || pt || ''
      }
      setJobTitleMap(jMap)

      // Group service-item titles by session for a "what was done" summary.
      const itemsBySession: Record<string, string[]> = {}
      for (const j of sessJobs ?? []) {
        const sid = (j as { session_id: string }).session_id
        const t = (j as { title: string | null }).title
        if (!t) continue
        ;(itemsBySession[sid] ??= []).push(t)
      }

      const sMap: Record<string, { label: string; date: string | null; shop: string | null; items: string[]; notes: string | null }> = {}
      for (const s of sessions ?? []) {
        const typeLabel = (s.type as string | null) === 'modification' ? 'Mod' : 'Service'
        const label = (s.title as string | null) || (s.shop_name as string | null) || typeLabel
        sMap[s.id as string] = {
          label,
          date: (s.date_performed as string | null) ?? null,
          shop: (s.shop_name as string | null) ?? null,
          items: itemsBySession[s.id as string] ?? [],
          notes: (s.notes as string | null) ?? null,
        }
      }
      setSessionInfoMap(sMap)
    })
    return () => { cancelled = true }
  }, [buildReceipts])

  function openNewDoc(prefillType?: DocType) { setError(null); setDraft({ ...EMPTY_DOC, doc_type: prefillType ?? 'registration' }) }
  function openNewReceipt() { setError(null); setDraft({ ...EMPTY_RECEIPT }) }
  function openEdit(d: Doc) {
    setError(null)
    const remindDays = d.doc_type !== 'receipt' ? (docReminders[d.id] ?? 0) : 0
    setDraft({
      id: d.id,
      kind: d.doc_type === 'receipt' ? 'receipt' : 'document',
      doc_type: d.doc_type, label: d.label ?? '',
      issued_date: d.issued_date ?? '', expiry_date: d.expiry_date ?? '',
      amount: d.amount != null ? String(d.amount) : '',
      remindDays,
      file: null, existingFileName: d.file_name,
    })
  }

  async function save() {
    if (!draft || !carId) return
    setSaving(true)
    setError(null)

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) { setError('Not signed in — please reload.'); setSaving(false); return }

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
        try { upload = await imageCompression(draft.file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true, exifOrientation: -1, fileType: 'image/jpeg' }) } catch { /* use original */ }
      }
      const { error: upErr } = await supabase.storage.from('car-documents').upload(path, upload, { contentType: isImg ? 'image/jpeg' : 'application/pdf' })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); setSaving(false); return }
      fileUrl = path
      fileType = isImg ? 'image' : 'pdf'
      fileName = draft.file.name
    }

    const isReceipt = draft.kind === 'receipt'
    const base: Record<string, unknown> = {
      doc_type: isReceipt ? 'receipt' : draft.doc_type,
      label: draft.label.trim() || null,
      issued_date: draft.issued_date || null,
      expiry_date: isReceipt ? null : (draft.expiry_date || null),
    }
    if (isReceipt) {
      const amt = parseFloat(draft.amount)
      base.amount = Number.isFinite(amt) ? amt : null
      base.currency = 'USD'
    }

    // Replacing a file → clean up the now-orphaned storage object.
    if (fileUrl && draft.id) {
      const old = [...docs, ...receiptDocs].find(d => d.id === draft.id)?.file_url
      if (old && old !== fileUrl) await supabase.storage.from('car-documents').remove([old])
    }

    let error
    let docId = draft.id
    if (draft.id) {
      const payload = fileUrl ? { ...base, file_url: fileUrl, file_type: fileType, file_name: fileName } : base
      ;({ error } = await supabase.from('car_documents').update(payload).eq('id', draft.id))
    } else {
      const payload = { ...base, car_id: carId, file_url: fileUrl ?? null, file_type: fileType ?? null, file_name: fileName ?? null }
      const res = await supabase.from('car_documents').insert(payload).select('id').single()
      error = res.error
      docId = res.data?.id
    }

    if (error) { setError(`Couldn't save: ${error.message}`); setSaving(false); return }

    // Expiry reminder — documents only. Upsert / delete the linked car_reminders row.
    // due_date is the real deadline (the expiry); remind_days_before just controls
    // how early it starts alerting — so it never reads as "overdue" before expiry.
    if (!isReceipt && docId) {
      const expiry = draft.expiry_date || null
      const { data: existing } = await supabase.from('car_reminders').select('id').eq('document_id', docId).limit(1)
      const existingId = existing?.[0]?.id as string | undefined
      if (draft.remindDays > 0 && expiry) {
        const remPayload = {
          title: `${draft.label.trim() || DOC_TYPE_LABEL[draft.doc_type]} expires`,
          category: DOCTYPE_TO_REMINDER[draft.doc_type],
          due_date: expiry,
          remind_days_before: draft.remindDays,
          document_id: docId,
        }
        if (existingId) await supabase.from('car_reminders').update(remPayload).eq('id', existingId)
        else await supabase.from('car_reminders').insert({ ...remPayload, car_id: carId })
      } else if (existingId) {
        await supabase.from('car_reminders').delete().eq('id', existingId)
      }
    }

    await loadData()
    setSaving(false)
    setDraft(null)
  }

  async function remove() {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    const doc = [...docs, ...receiptDocs].find(d => d.id === draft.id)
    if (doc?.file_url) await supabase.storage.from('car-documents').remove([doc.file_url])
    // Drop any expiry reminder linked to this document.
    await supabase.from('car_reminders').delete().eq('document_id', draft.id)
    const { error } = await supabase.from('car_documents').delete().eq('id', draft.id)
    if (error) { setError(`Couldn't delete: ${error.message}`); setSaving(false); return }
    await loadData()
    setSaving(false)
    setDraft(null)
  }

  const isReceiptDraft = draft?.kind === 'receipt'

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: VAULT_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`
        @keyframes docIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
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

      {/* ── Tabs ── */}
      {!loading && !noCar && (
        <div style={{ display: 'flex', flexShrink: 0, background: 'rgba(0,0,0,0.25)', borderBottom: `1px solid ${FAINT}` }}>
          {(['documents', 'receipts'] as Tab[]).map(t => {
            const active = tab === t
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, minHeight: 44, background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: active ? CREAM : DIM,
                borderBottom: `2px solid ${active ? COLOR_ACCENT : 'transparent'}`,
                WebkitTapHighlightColor: 'transparent',
              }}>{t}</button>
            )
          })}
        </div>
      )}

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

            {/* ════════════ DOCUMENTS TAB ════════════ */}
            {tab === 'documents' && (
              <>
                {docs.length === 0 && (
                  <div style={{ paddingTop: SPACE_SM }}>
                    <div style={{ textAlign: 'center', marginBottom: SPACE_XL }}>
                      <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', border: '1.5px solid rgba(240,228,200,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(240,228,200,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>
                      </div>
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: CREAM, margin: '0 0 6px' }}>The glovebox</p>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: DIM, margin: 0, lineHeight: 1.5 }}>
                        Registration, insurance, title — kept private, opened only by you.
                      </p>
                    </div>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM, margin: `0 0 ${SPACE_SM}px ${SPACE_XS}px` }}>Add a document</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE_SM }}>
                      {(['registration', 'insurance', 'title', 'emissions', 'inspection', 'warranty'] as DocType[]).map(t => (
                        <button key={t} onClick={() => openNewDoc(t)} style={{
                          display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px',
                          background: PAPER, border: 'none', borderLeft: `4px solid ${COLOR_ACCENT}`,
                          boxShadow: '0 2px 5px rgba(0,0,0,0.45)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                        }}>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 18, color: COLOR_ACCENT, lineHeight: 1 }}>+</span>
                          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: PAPER_INK, textAlign: 'left' }}>{DOC_TYPE_LABEL[t]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                        <button
                          onClick={() => setDetailItem({ kind: 'doc', doc: d })}
                          style={{
                            flexShrink: 0, width: 72, alignSelf: 'stretch',
                            background: thumbs[d.id] ? `center/cover no-repeat url(${thumbs[d.id]})` : 'rgba(31,26,18,0.06)',
                            opacity: thumbs[d.id] ? (thumbLoaded.has(d.id) ? 1 : 0) : 1,
                            transition: 'opacity 300ms ease',
                            border: 'none', borderRight: `1px solid ${PAPER_LINE}`,
                            cursor: 'pointer',
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

                        <button
                          onClick={() => setDetailItem({ kind: 'doc', doc: d })}
                          style={{
                            flex: 1, minWidth: 0, padding: `${SPACE_SM + 2}px ${SPACE_MD}px`,
                            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT }}>
                            {DOC_TYPE_LABEL[d.doc_type]}{d.file_url ? ' · tap to view' : ''}
                          </span>

                          <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15.5, color: PAPER_INK, margin: '3px 0 0', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.label || d.file_name || DOC_TYPE_LABEL[d.doc_type]}
                          </p>

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
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(d) }}
                          style={{
                            position: 'absolute', top: SPACE_SM + 2, right: SPACE_MD,
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: PAPER_MUTED, WebkitTapHighlightColor: 'transparent',
                            minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                          }}
                        >Edit</button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* ════════════ RECEIPTS TAB ════════════ */}
            {tab === 'receipts' && (
              <>
                {/* Empty state — only when the owner hasn't added any standalone receipts */}
                {receiptDocs.length === 0 && (
                  <div style={{ paddingTop: SPACE_SM, marginBottom: buildReceipts.length > 0 ? SPACE_XL : 0 }}>
                    <div style={{ textAlign: 'center', marginBottom: SPACE_LG }}>
                      <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: '50%', border: '1.5px solid rgba(240,228,200,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(240,228,200,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>
                      </div>
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: CREAM, margin: '0 0 6px' }}>Receipts</p>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: DIM, margin: 0, lineHeight: 1.5 }}>
                        Insurance, registration, fees — title each one. Service &amp; part receipts from your build show up here automatically.
                      </p>
                    </div>
                    <button onClick={openNewReceipt} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', minHeight: 52, padding: '0 14px',
                      background: PAPER, border: 'none', borderLeft: `4px solid ${COLOR_ACCENT}`,
                      boxShadow: '0 2px 5px rgba(0,0,0,0.45)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 18, color: COLOR_ACCENT, lineHeight: 1 }}>+</span>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: PAPER_INK }}>Add a receipt</span>
                    </button>
                  </div>
                )}

                {/* Standalone (owner-added) receipts — editable */}
                {receiptDocs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_MD, marginBottom: buildReceipts.length > 0 ? SPACE_XL : 0 }}>
                    {receiptDocs.map((d, i) => (
                      <div key={d.id} style={{
                        position: 'relative', display: 'flex',
                        background: PAPER, borderLeft: `4px solid ${COLOR_ACCENT}`,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.5), 0 10px 22px rgba(0,0,0,0.32)',
                        animation: `docIn 420ms ${EASING_SETTLE} ${i * 50}ms both`,
                      }}>
                        {/* Left file thumbnail — opens detail panel */}
                        <button
                          onClick={() => setDetailItem({ kind: 'doc', doc: d })}
                          style={{
                            flexShrink: 0, width: 72, alignSelf: 'stretch',
                            background: thumbs[d.id] ? `center/cover no-repeat url(${thumbs[d.id]})` : 'rgba(31,26,18,0.06)',
                            opacity: thumbs[d.id] ? (thumbLoaded.has(d.id) ? 1 : 0) : 1,
                            transition: 'opacity 300ms ease',
                            border: 'none', borderRight: `1px solid ${PAPER_LINE}`,
                            cursor: d.file_url ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          {!thumbs[d.id] && (
                            d.file_type === 'pdf'
                              ? <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.08em', color: PAPER_MUTED }}>PDF</span>
                              : d.file_url
                                ? <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, color: PAPER_MUTED }}>FILE</span>
                                : <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.06em', color: 'rgba(31,26,18,0.3)', textAlign: 'center', lineHeight: 1.3 }}>NO<br/>FILE</span>
                          )}
                        </button>
                        {/* Card body — opens detail panel */}
                        <button
                          onClick={() => setDetailItem({ kind: 'doc', doc: d })}
                          style={{
                            flex: 1, minWidth: 0, padding: `${SPACE_SM + 2}px ${SPACE_MD}px`,
                            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE_SM }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT }}>Receipt</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: SPACE_SM, marginTop: 3 }}>
                            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15.5, color: PAPER_INK, margin: 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {d.label || d.file_name || 'Receipt'}
                            </p>
                            {fmtMoney(d.amount, d.currency) && (
                              <span style={{ flexShrink: 0, fontFamily: FONT_UI, fontWeight: 800, fontSize: 15, color: PAPER_INK }}>{fmtMoney(d.amount, d.currency)}</span>
                            )}
                          </div>
                          {/* Always show a date — issued_date first, fall back to created_at */}
                          <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 11, color: PAPER_MUTED, margin: '6px 0 0' }}>
                            {fmtDate(d.issued_date ?? (d as unknown as { created_at?: string }).created_at ?? null) ?? ''}
                          </p>
                        </button>
                        {/* Edit button — independent, top-right corner */}
                        <button
                          onClick={e => { e.stopPropagation(); openEdit(d) }}
                          style={{
                            position: 'absolute', top: SPACE_SM + 2, right: SPACE_MD,
                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.1em',
                            textTransform: 'uppercase', color: PAPER_MUTED, WebkitTapHighlightColor: 'transparent',
                            minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                          }}
                        >Edit</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Build receipts — read-only, pulled from public.receipts */}
                {buildReceipts.length > 0 && (
                  <>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: DIM, margin: `0 0 ${SPACE_SM}px ${SPACE_XS}px` }}>
                      From your build · {buildReceipts.length}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
                      {buildReceipts.map((r, i) => {
                        const sessionInfo = r.session_id ? sessionInfoMap[r.session_id] : null
                        // "What was done" for a service: summarise its service items,
                        // else the session title/notes. Part receipts use the part title.
                        const serviceWhat = (() => {
                          const items = sessionInfo?.items ?? []
                          if (items.length === 1) return items[0]
                          if (items.length === 2) return `${items[0]} + ${items[1]}`
                          if (items.length > 2)  return `${items[0]} +${items.length - 1} more`
                          const lbl = sessionInfo?.label
                          if (lbl && lbl !== 'Service' && lbl !== 'Mod' && lbl !== sessionInfo?.shop) return lbl
                          if (sessionInfo?.notes) return sessionInfo.notes
                          return r.vendor || r.file_name || 'Service'
                        })()
                        // Primary line = WHAT. Secondary line = WHERE (shop / vendor).
                        const primaryTitle = r.job_id
                          ? (jobTitleMap[r.job_id] || r.vendor || r.file_name || 'Part Receipt')
                          : serviceWhat
                        const secondaryLine = (() => {
                          if (r.job_id) return r.vendor && r.vendor !== primaryTitle ? r.vendor : null
                          const shop = sessionInfo?.shop
                          if (shop && shop !== primaryTitle) return shop
                          if (r.vendor && r.vendor !== primaryTitle) return r.vendor
                          return null
                        })()
                        // Date: receipt_date → session date → created_at
                        const displayDate = r.receipt_date ?? sessionInfo?.date ?? r.created_at
                        return (
                          <button
                            key={r.id}
                            onClick={() => setDetailItem({ kind: 'buildReceipt', receipt: r })}
                            style={{
                              display: 'flex', alignItems: 'center', gap: SPACE_MD, width: '100%', textAlign: 'left',
                              background: 'rgba(240,228,200,0.04)', border: `1px solid ${FAINT}`,
                              padding: `${SPACE_SM}px ${SPACE_MD}px`, cursor: 'pointer',
                              WebkitTapHighlightColor: 'transparent',
                              animation: `docIn 420ms ${EASING_SETTLE} ${i * 40}ms both`,
                            }}
                          >
                            <span style={{
                              flexShrink: 0, fontFamily: FONT_UI, fontWeight: 800, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
                              color: COLOR_ACCENT, border: `1px solid ${COLOR_ACCENT}`, padding: '3px 6px',
                            }}>{r.job_id ? 'Part' : 'Service'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13.5, color: CREAM, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryTitle}</p>
                              {secondaryLine && (
                                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: DIM, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondaryLine}</p>
                              )}
                              {/* Date + file indicator */}
                              <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: DIM, margin: '2px 0 0' }}>
                                {fmtDate(displayDate) ?? ''}{r.file_url ? ' · tap to view file' : ' · tap to view'}
                              </p>
                            </div>
                            {fmtMoney(r.amount, r.currency) && (
                              <span style={{ flexShrink: 0, fontFamily: FONT_UI, fontWeight: 800, fontSize: 14, color: CREAM }}>{fmtMoney(r.amount, r.currency)}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: DIM, margin: `${SPACE_MD}px 0 0`, lineHeight: 1.5, textAlign: 'center' }}>
                      Build receipts are added with each service &amp; part — edit them there.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add FAB — context depends on the active tab */}
      {!loading && !noCar && (
        <button
          onClick={() => (tab === 'receipts' ? openNewReceipt() : openNewDoc())}
          aria-label={tab === 'receipts' ? 'Add receipt' : 'Add document'}
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

      {/* ── Detail panel ── */}
      {detailItem && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDetailItem(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 40 }}
          />
          {/* Panel */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 41,
            maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
            background: SHEET_BG, borderRadius: '12px 12px 0 0',
            overflow: 'hidden',
          }}>
            {/* Handle + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0', flexShrink: 0 }}>
              <div style={{ width: 40, height: 4, background: 'rgba(240,228,200,0.2)', borderRadius: 2, margin: '0 auto' }} />
            </div>
            <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
              <button onClick={() => setDetailItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 10, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: DIM, fontSize: 22, fontWeight: 300, WebkitTapHighlightColor: 'transparent' }}>✕</button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Image or PDF indicator */}
              {(() => {
                const fileType = detailItem.kind === 'buildReceipt' ? detailItem.receipt.file_type : detailItem.doc.file_type
                const hasFile = detailItem.kind === 'buildReceipt' ? !!detailItem.receipt.file_url : !!detailItem.doc.file_url
                if (fileType === 'image') {
                  return (
                    <div style={{ width: '100%', minHeight: 200, maxHeight: '50vh', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {detailUrlLoading && <span style={{ fontFamily: FONT_UI, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DIM }}>Loading…</span>}
                      {detailSignedUrl && <img src={detailSignedUrl} alt="" style={{ width: '100%', maxHeight: '50vh', objectFit: 'contain', display: 'block' }} />}
                    </div>
                  )
                }
                if (fileType === 'pdf' && hasFile) {
                  return (
                    <div style={{ padding: '16px 16px 0' }}>
                      <button onClick={openDetailPdf} style={{
                        width: '100%', minHeight: 48, background: 'rgba(240,228,200,0.07)', border: `1px solid ${FAINT}`,
                        cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <span style={{ color: COLOR_ACCENT }}>↗</span> View PDF
                      </button>
                    </div>
                  )
                }
                return null
              })()}

              {/* Details */}
              <div style={{ padding: '16px 16px 32px' }}>
                {detailItem.kind === 'doc' && (() => {
                  const d = detailItem.doc
                  const status = expiryStatus(d.expiry_date)
                  return (
                    <>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT }}>{DOC_TYPE_LABEL[d.doc_type]}</span>
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: CREAM, margin: '4px 0 12px', lineHeight: 1.2 }}>
                        {d.label || d.file_name || DOC_TYPE_LABEL[d.doc_type]}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {d.issued_date && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: DIM }}>Issued</span>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: CREAM }}>{fmtDate(d.issued_date)}</span>
                          </div>
                        )}
                        {d.expiry_date && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: DIM }}>Expires</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: CREAM }}>{fmtDate(d.expiry_date)}</span>
                              {status && status !== 'ok' && (
                                <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: status === 'expired' ? '#fff5dc' : COLOR_ACCENT, background: status === 'expired' ? COLOR_ACCENT : 'transparent', border: `1px solid ${COLOR_ACCENT}`, padding: '2px 6px' }}>
                                  {status === 'expired' ? 'Expired' : 'Soon'}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => { setDetailItem(null); openEdit(d) }} style={{
                        marginTop: 24, width: '100%', minHeight: 48,
                        background: 'rgba(240,228,200,0.07)', border: `1px solid ${FAINT}`,
                        cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
                        letterSpacing: '0.1em', textTransform: 'uppercase', color: CREAM,
                      }}>Edit Document</button>
                    </>
                  )
                })()}

                {detailItem.kind === 'buildReceipt' && (() => {
                  const r = detailItem.receipt
                  const sessionInfo = r.session_id ? sessionInfoMap[r.session_id] : null
                  const serviceWhat = (() => {
                    const items = sessionInfo?.items ?? []
                    if (items.length === 1) return items[0]
                    if (items.length > 1) return items.join(', ')
                    const lbl = sessionInfo?.label
                    if (lbl && lbl !== 'Service' && lbl !== 'Mod') return lbl
                    return r.vendor || 'Service'
                  })()
                  const title = r.job_id ? (jobTitleMap[r.job_id] || r.vendor || 'Part Receipt') : serviceWhat
                  const shop = (() => {
                    if (r.job_id) return r.vendor && r.vendor !== title ? r.vendor : null
                    const s = sessionInfo?.shop
                    if (s && s !== title) return s
                    return r.vendor && r.vendor !== title ? r.vendor : null
                  })()
                  const displayDate = r.receipt_date ?? sessionInfo?.date ?? r.created_at
                  return (
                    <>
                      <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: COLOR_ACCENT }}>{r.job_id ? 'Part Receipt' : 'Service Receipt'}</span>
                      <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: CREAM, margin: '4px 0 12px', lineHeight: 1.2 }}>{title}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        {shop && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: DIM }}>Shop / Vendor</span>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: CREAM }}>{shop}</span>
                          </div>
                        )}
                        {displayDate && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: DIM }}>Date</span>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: CREAM }}>{fmtDate(displayDate)}</span>
                          </div>
                        )}
                        {fmtMoney(r.amount, r.currency) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: DIM }}>Amount</span>
                            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 14, color: CREAM }}>{fmtMoney(r.amount, r.currency)}</span>
                          </div>
                        )}
                      </div>
                      {/* Link to source record */}
                      {!r.job_id && r.session_id && (
                        <button onClick={() => { setDetailItem(null); navigate(`/maintenance/${r.session_id}`) }} style={{
                          width: '100%', minHeight: 48, background: 'rgba(240,228,200,0.07)', border: `1px solid ${FAINT}`,
                          cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: CREAM,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>View Service Session <span style={{ color: COLOR_ACCENT }}>›</span></button>
                      )}
                      {r.job_id && (
                        <button onClick={() => { setDetailItem(null); navigate(`/tuning/mods/${r.job_id}`) }} style={{
                          width: '100%', minHeight: 48, background: 'rgba(240,228,200,0.07)', border: `1px solid ${FAINT}`,
                          cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 12,
                          letterSpacing: '0.1em', textTransform: 'uppercase', color: CREAM,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>View Mod <span style={{ color: COLOR_ACCENT }}>›</span></button>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Add / Edit sheet ── */}
      <BottomSheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={isReceiptDraft ? (draft?.id ? 'Edit Receipt' : 'New Receipt') : (draft?.id ? 'Edit Document' : 'New Document')}
        bg={SHEET_BG}
        busy={saving}
      >
        {draft && (
          <>
            {!isReceiptDraft && (
              <>
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
              </>
            )}

            <FieldLabel>{isReceiptDraft ? 'Title' : 'Label'}</FieldLabel>
            <input
              value={draft.label}
              onChange={e => setDraft({ ...draft, label: e.target.value })}
              placeholder={isReceiptDraft ? 'e.g. Insurance payment — June' : LABEL_PLACEHOLDER[draft.doc_type]}
              style={{ ...sheetInput, marginBottom: SPACE_MD }}
            />

            {isReceiptDraft ? (
              <div style={{ display: 'flex', gap: SPACE_MD }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Amount</FieldLabel>
                  <input
                    value={draft.amount}
                    onChange={e => setDraft({ ...draft, amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="$0.00"
                    style={{ ...sheetInput, marginBottom: SPACE_MD }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Date</FieldLabel>
                  <input type="date" value={draft.issued_date} onChange={e => setDraft({ ...draft, issued_date: e.target.value })} style={{ ...sheetInput, colorScheme: 'dark', marginBottom: SPACE_MD }} />
                </div>
              </div>
            ) : (
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
            )}

            {/* Expiry reminder — documents with an expiry date only */}
            {!isReceiptDraft && draft.expiry_date && (
              <>
                <FieldLabel>Remind me before it expires</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_XS, marginBottom: SPACE_MD }}>
                  {REMIND_PRESETS.map(p => {
                    const active = draft.remindDays === p.days
                    return (
                      <button key={p.days} onClick={() => setDraft({ ...draft, remindDays: p.days })} style={{
                        padding: '6px 12px',
                        background: active ? COLOR_ACCENT : 'rgba(240,228,200,0.05)',
                        border: `1px solid ${active ? COLOR_ACCENT : FAINT}`,
                        color: active ? '#fff5dc' : 'rgba(240,228,200,0.7)',
                        fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', cursor: 'pointer',
                      }}>{p.label}</button>
                    )
                  })}
                </div>
                <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 10.5, color: DIM, margin: `-6px 0 ${SPACE_MD}px`, lineHeight: 1.4 }}>
                  Adds a reminder on the Reminders screen, ahead of the expiry date.
                </p>
              </>
            )}

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

            {error && (
              <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: '#e08a6e', margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.4 }}>{error}</p>
            )}

            <button onClick={save} disabled={saving} style={{
              width: '100%', minHeight: 48, background: COLOR_ACCENT, border: 'none', cursor: saving ? 'default' : 'pointer',
              color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : draft.id ? 'Save Changes' : isReceiptDraft ? 'Add Receipt' : 'Add Document'}</button>

            {draft.id && (
              <button onClick={remove} disabled={saving} style={{
                width: '100%', minHeight: 44, marginTop: SPACE_SM, background: 'none', border: '1px solid rgba(180,60,40,0.5)', cursor: 'pointer',
                color: COLOR_ERROR, fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>{isReceiptDraft ? 'Delete Receipt' : 'Delete Document'}</button>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  )
}
