// The fill-up sheet (ADR-033). Opened from the grip at the foot of the Home map.
//
// WHY A SHEET AND NOT A ROUTE. Logging a fill-up is a ten-second job standing at
// a pump, which is the worst connection the app ever sees. A route means a lazy
// chunk fetch and a fresh round-trip before the first field can be typed into.
// This ships inside the Home chunk and receives everything it needs as props, so
// opening it costs nothing over the network. /fuel is the browsing half, where a
// chart and a log are allowed to cost a moment.
//
// WHY IT REUSES BottomSheet. The design mockup drew its own shell, but the shared
// one already carries swipe-to-dismiss, background scroll-lock and safe-area
// padding, and reimplementing those is how gesture bugs get reintroduced one
// screen at a time. The fuel character lives in the fields, not in the chrome.
//
// THE ONE THING THIS SCREEN KNOWS THAT NO FORM SHOULD MAKE YOU DO: arithmetic.
// Price per unit is derived from volume and total, and the tank's economy is
// derived live from the odometer you are typing, by running the real chain in
// lib/fuel rather than a second approximation of it.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import BottomSheet from './BottomSheet'
import { reportActionError } from '../lib/appError'
import { playConfirm } from '../lib/sound'
import { SIGNED_URL_TTL } from '../lib/signedUrls'
import { milesToUnit, unitToMiles, type MileageUnit } from '../lib/mileage'
import {
  computeTanks, pricePerUnit, unitToGal, galToUnit, volumeLabel, economyLabel, formatEconomy,
  type EconomyUnit, type FuelEntry, type VolumeUnit,
} from '../lib/fuel'
import {
  COLOR_ACCENT, COLOR_PANEL_TEXT, FONT_UI, GRADIENT_PANEL, RADIUS_BUTTON,
} from '../tokens'

export type FuelSheetCar = {
  id: string
  /** "2006 LS 430" — informational, matching every other header in the app. */
  name: string
  mileageUnit: MileageUnit
  currentMileage: number | null
}

const CREAM = 'rgba(245,245,245,'
/** The concrete panel's own muted ink, for units and placeholders. */
const PANEL_MUTED = '#6a6a6c'

/** Local ISO date (not toISOString, which would roll to tomorrow after 4pm PT). */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Blank, whitespace and junk all mean "not entered"; 0 is a real answer.
 *
 * Thousands separators, spaces and a currency symbol are stripped first. People
 * read "112,812" off a cluster and type it back with the comma, and Number()
 * turns that into NaN — which would have read as an empty field and blocked the
 * save with "Enter the odometer reading" over a reading that was right there.
 */
function num(s: string): number | null {
  const t = s.replace(/[,\s$]/g, '')
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * Typed something, and it is not a number.
 *
 * num() cannot answer this on its own: it collapses "empty" and "gibberish" into
 * the same null, and null means "not entered" for the optional fields. So a
 * fat-fingered volume used to save as an odometer-only entry — accepted,
 * cheerful, and quietly missing the gallons the whole feature is about.
 */
function isJunk(s: string): boolean {
  return s.replace(/[,\s$]/g, '') !== '' && num(s) == null
}

// Column limits from migration 097, enforced here so a real reading never turns
// into a 400 from PostgREST. odometer is int4; volume is numeric(8,3);
// total_cost is numeric(10,2).
const MAX_ODOMETER_MI = 9_999_999
const MAX_TOTAL = 99_999_999.99

/** A receipt already in the bucket, with a signed URL for the thumbnail. */
type ExistingReceipt = { id: string; file_url: string; file_type: 'image' | 'pdf'; file_name: string | null; url: string | null }

export default function FuelSheet({
  open, onClose, car, volumeUnit, economyUnit, recent, entry = null, showHistoryLink = true, onSaved,
}: {
  open: boolean
  onClose: () => void
  car: FuelSheetCar | null
  volumeUnit: VolumeUnit
  /** How this user spells economy (migration 099). The sheet must use the same
   *  unit /fuel will, or the figure it predicts is not the figure they get. */
  economyUnit: EconomyUnit
  /** The tail of the log, oldest first. Supplies the context line and the live
   *  economy estimate; an empty array is a perfectly valid first fill-up. */
  recent: FuelEntry[]
  /** Set to edit that row instead of adding one. The same fields, the same
   *  validation and the same live figures: a second form would be a second set
   *  of rules to keep in step with lib/fuel. */
  entry?: FuelEntry | null
  /** False on /fuel itself, where the link would navigate to the page you are
   *  already on. */
  showHistoryLink?: boolean
  /** Fired after a save OR a delete, so the caller can refresh either way. */
  onSaved: () => void
}) {
  const editing = entry != null
  const navigate = useNavigate()
  const mUnit = car?.mileageUnit ?? 'mi'
  const vLabel = volumeLabel(volumeUnit)
  const eLabel = economyLabel(economyUnit)

  const [odo, setOdo] = useState('')
  const [vol, setVol] = useState('')
  const [total, setTotal] = useState('')
  const [isFull, setIsFull] = useState(true)
  const [isMissed, setIsMissed] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const savingRef = useRef(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Receipts. Three lists rather than one, because they have three different
  // fates on save: `existing` stays, `removed` needs its storage object deleted
  // as well as its row, and `pending` has no row yet and no id to file under
  // until the entry itself exists.
  const [existingReceipts, setExistingReceipts] = useState<ExistingReceipt[]>([])
  const [removedReceipts, setRemovedReceipts] = useState<{ id: string; file_url: string }[]>([])
  const [pendingReceipts, setPendingReceipts] = useState<{ file: File; preview: string | null; name: string }[]>([])

  // Fresh every time it opens. The sheet unmounts while closed (BottomSheet
  // returns null), but the state above would survive a re-open within the same
  // Home visit and silently offer yesterday's numbers.
  useEffect(() => {
    if (!open) return
    if (entry) {
      setOdo(String(milesToUnit(entry.odometer, mUnit)))
      setVol(entry.volume != null ? String(Number(galToUnit(entry.volume, volumeUnit).toFixed(3))) : '')
      setTotal(entry.total_cost != null ? String(entry.total_cost) : '')
      setIsFull(entry.is_full); setIsMissed(entry.is_missed)
      setDate(entry.filled_on)
    } else {
      setOdo(car?.currentMileage != null ? String(milesToUnit(car.currentMileage, mUnit)) : '')
      setVol(''); setTotal('')
      setIsFull(true); setIsMissed(false)
      setDate(todayIso())
    }
    savingRef.current = false
    setSaving(false); setErr(null); setConfirmDelete(false)
    setExistingReceipts([]); setRemovedReceipts([]); setPendingReceipts([])
  }, [open, entry, car?.currentMileage, mUnit, volumeUnit])

  // Existing receipts, only in edit mode. Signed URLs, never getPublicUrl: the
  // `receipts` bucket is private and holds financial records.
  useEffect(() => {
    if (!open || !entry) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('receipts')
        .select('id, file_url, file_type, file_name')
        .eq('fuel_entry_id', entry.id)
        .order('created_at', { ascending: true })
      const rows = (data ?? []) as Omit<ExistingReceipt, 'url'>[]
      if (!alive || rows.length === 0) return
      const { data: signed } = await supabase.storage.from('receipts')
        .createSignedUrls(rows.map(r => r.file_url), SIGNED_URL_TTL)
      if (!alive) return
      setExistingReceipts(rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null })))
    })()
    return () => { alive = false }
  }, [open, entry])

  // A refusal describes the values as they were when Save was pressed, so it has
  // to die the moment any of them change. Left to clear only on the next save it
  // sat under a corrected field insisting the reading was missing.
  useEffect(() => { setErr(null) }, [odo, vol, total, isFull, isMissed, date])

  const odoNum = num(odo)
  const volNum = num(vol)
  const totalNum = num(total)
  const odoMi = odoNum != null ? unitToMiles(odoNum, mUnit) : null

  // The row being edited is already in `recent`. Leaving it there would make the
  // preview measure the draft against its own stored version, so every keystroke
  // would be compared to a tank that is about to stop existing.
  const others = useMemo(
    () => (entry ? recent.filter(r => r.id !== entry.id) : recent),
    [recent, entry])

  const lastEntry = others.length ? others[others.length - 1] : null
  const lastTankMpg = useMemo(() => {
    const done = computeTanks(others).filter(t => t.mpg != null)
    return done.length ? done[done.length - 1].mpg : null
  }, [others])

  // Distance on this tank, live from the field rather than from the stored
  // odometer, so correcting a digit corrects the sentence above it.
  const sinceMi = odoMi != null && lastEntry ? odoMi - lastEntry.odometer : null

  // The provisional tank. Running the real chain (rather than miles/gallons here)
  // means a partial fill, a missed fill and a first entry all say the right thing
  // for free, and can never disagree with what /fuel shows after the save.
  const liveMpg = useMemo(() => {
    if (odoMi == null || volNum == null || volNum <= 0) return null
    const draft: FuelEntry = {
      id: '__draft', filled_on: date, odometer: odoMi,
      volume: unitToGal(volNum, volumeUnit), total_cost: totalNum,
      is_full: isFull, is_missed: isMissed,
    }
    const tanks = computeTanks([...others, draft])
    return tanks.find(t => t.entry.id === '__draft')?.mpg ?? null
  }, [odoMi, volNum, totalNum, isFull, isMissed, date, others, volumeUnit])

  const price = pricePerUnit(totalNum, volNum)

  // A reading below the last one is nearly always a typo, but a replaced cluster
  // is real, so this warns and never blocks.
  const backwards = odoMi != null && lastEntry != null && odoMi < lastEntry.odometer

  const save = async () => {
    if (!car) return
    // The `disabled` prop is not a guard: it only takes effect after a render,
    // and two taps inside one frame both reach this function before React has
    // painted the disabled state. A ref closes the window synchronously, which
    // is the difference between one fill-up and two identical ones.
    if (savingRef.current) return
    if (odoNum == null || odoNum < 0) { setErr('Enter the odometer reading.'); return }
    if (odoMi == null || odoMi > MAX_ODOMETER_MI) { setErr('That odometer reading is too high to be real.'); return }
    if (isJunk(vol)) { setErr('That volume is not a number.'); return }
    if (isJunk(total)) { setErr('That total is not a number.'); return }
    if (totalNum != null && (totalNum < 0 || totalNum > MAX_TOTAL)) { setErr('Check the total.'); return }
    // A date input can be cleared, and an empty filled_on is a NOT NULL
    // violation dressed up as a shrug. A future one is not a fill-up yet.
    if (!date) { setErr('Pick a date.'); return }
    if (date > todayIso()) { setErr('That date is in the future.'); return }

    // Rounded to what the column actually stores BEFORE the check, because
    // 0.0001 litres is a positive number that becomes 0.000 US gallons on the
    // way in, and the row would be rejected by the volume > 0 constraint with a
    // message about a value the user never typed.
    const gal = volNum != null ? Number(unitToGal(volNum, volumeUnit).toFixed(3)) : null
    if (volNum != null && (gal == null || gal <= 0)) {
      setErr(`Volume has to be more than zero, or leave it empty.`); return
    }

    savingRef.current = true
    setSaving(true); setErr(null)
    const stop = () => { savingRef.current = false; setSaving(false) }
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id
    if (!uid) { reportActionError("Couldn't save the fill-up"); stop(); return }

    const row = {
      filled_on: date,
      odometer: odoMi,
      volume: gal,
      total_cost: totalNum != null ? Number(totalNum.toFixed(2)) : null,
      is_full: isFull,
      is_missed: isMissed,
    }

    // The insert asks for the id back because the receipts are filed under it,
    // and there is nothing to file under until the row exists.
    const { data: saved, error } = entry
      ? await supabase.from('fuel_entries').update(row).eq('id', entry.id).select('id').single()
      : await supabase.from('fuel_entries').insert({ ...row, car_id: car.id, user_id: uid }).select('id').single()

    if (error || !saved) {
      reportActionError("Couldn't save the fill-up", error)
      // Say it in the sheet as well as in the global banner: at a pump the
      // banner is off the top of a sheet that covers most of the screen, and a
      // Save button that quietly goes back to idle reads as a save.
      setErr("Couldn't save that. Check your connection and try again.")
      stop()
      return
    }
    const entryId = (saved as { id: string }).id

    // Receipts are best-effort AFTER the entry is safe. A failed upload must not
    // lose the reading, which is the part that matters and the part that was
    // typed at a pump.
    if (removedReceipts.length > 0) {
      await supabase.storage.from('receipts').remove(removedReceipts.map(r => r.file_url))
      await supabase.from('receipts').delete().in('id', removedReceipts.map(r => r.id))
    }
    if (pendingReceipts.length > 0) {
      await Promise.all(pendingReceipts.map(async r => {
        const isImg = r.file.type.startsWith('image/')
        const ext = isImg ? 'jpg' : 'pdf'
        const path = `${uid}/${car.id}/${entryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        let upload: File | Blob = r.file
        // Always JPEG for images, per the house rule: iPhone HEIC is not
        // universally supported and a receipt nobody can open is not a receipt.
        if (isImg) {
          try {
            upload = await imageCompression(r.file, {
              maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
              exifOrientation: -1, fileType: 'image/jpeg',
            })
          } catch { /* fall back to the original */ }
        }
        const { error: upErr } = await supabase.storage.from('receipts').upload(path, upload)
        if (upErr) return
        await supabase.from('receipts').insert({
          fuel_entry_id: entryId, file_url: path,
          file_type: isImg ? 'image' : 'pdf', file_name: r.name,
        })
      }))
    }

    // Keep the odometer fresh — the internal reason this feature exists at all
    // (migration 097). Forward-only, the same clamp the four existing writers
    // use, so backdating an old fill can never wind the car's reading back.
    if (odoMi != null && odoMi > (car.currentMileage ?? -1)) {
      await supabase.from('cars').update({ current_mileage: odoMi }).eq('id', car.id)
    }

    playConfirm()
    stop()
    onSaved()
    onClose()
  }

  const remove = async () => {
    if (!entry || savingRef.current) return
    savingRef.current = true
    setSaving(true); setErr(null)
    // Storage objects FIRST. The receipts rows cascade with the entry (migration
    // 100), and a cascade cannot reach into the bucket — deleting the entry
    // first would leave the files behind with nothing left pointing at them.
    const { data: rows } = await supabase.from('receipts')
      .select('file_url').eq('fuel_entry_id', entry.id)
    const paths = ((rows ?? []) as { file_url: string }[]).map(r => r.file_url)
    if (paths.length) await supabase.storage.from('receipts').remove(paths)

    const { error } = await supabase.from('fuel_entries').delete().eq('id', entry.id)
    savingRef.current = false
    setSaving(false)
    if (error) {
      reportActionError("Couldn't delete the fill-up", error)
      setErr("Couldn't delete that. Check your connection and try again.")
      return
    }
    playConfirm()
    onSaved()
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Edit fill-up' : 'Fill-up'} bg="#0d0e10" busy={saving}>
      {/* Context. Says what this fill-up is being measured against, which is the
          one thing a bare form cannot tell you. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: 'rgba(200,102,26,0.92)', letterSpacing: '0.01em' }}>
          {lastEntry
            ? [
                sinceMi != null && sinceMi > 0 ? `${sinceMi.toLocaleString()} ${mUnit} since last fill` : 'Since your last fill',
                lastTankMpg != null ? `${formatEconomy(lastTankMpg, economyUnit)} ${eLabel} last tank` : null,
              ].filter(Boolean).join(' · ')
            : editing
              ? 'The first fill-up on this car.'
              : 'First fill-up. Add your next one to see your fuel economy.'}
        </span>
        {car && (
          <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, color: `${CREAM}0.40)`, whiteSpace: 'nowrap' }}>
            {car.name}
          </span>
        )}
      </div>

      <Label>Odometer</Label>
      <Panel>
        <input
          value={odo}
          onChange={e => setOdo(e.target.value)}
          onFocus={e => e.currentTarget.select()}
          inputMode="numeric"
          placeholder="0"
          aria-label="Odometer"
          style={panelInput}
        />
        <Unit>{mUnit}</Unit>
      </Panel>
      {backwards && lastEntry && (
        <Note>
          Lower than the last reading of {milesToUnit(lastEntry.odometer, mUnit).toLocaleString()} {mUnit}. It saves either way.
        </Note>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        {/* minWidth 0 is load-bearing: an <input> has a min-content width of about
            20 characters, and a flex item's default `min-width: auto` honours it,
            so `flex: 1` alone let the pair overflow the sheet and pushed Total
            off the right edge. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>{vLabel === 'L' ? 'Litres' : 'Gallons'}</Label>
          <Panel>
            <input value={vol} onChange={e => setVol(e.target.value)} inputMode="decimal"
                   placeholder="0.0" aria-label="Volume" style={panelInput} />
            <Unit>{vLabel}</Unit>
          </Panel>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>Total</Label>
          <Panel>
            <input value={total} onChange={e => setTotal(e.target.value)} inputMode="decimal"
                   placeholder="0.00" aria-label="Total cost" style={panelInput} />
            <Unit>usd</Unit>
          </Panel>
        </div>
      </div>

      {/* Derived, never typed. */}
      <div style={{ marginTop: 8, minHeight: 17, fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: `${CREAM}0.50)` }}>
        {[
          price != null ? `$${price.toFixed(2)} per ${vLabel === 'L' ? 'litre' : 'gallon'}` : null,
          liveMpg != null ? `${formatEconomy(liveMpg, economyUnit)} ${eLabel} this tank` : null,
        ].filter(Boolean).join('  ·  ')}
      </div>

      <Switch
        on={isFull}
        onToggle={() => setIsFull(v => !v)}
        title="Filled the tank"
        sub="Turn off for a partial fill"
      />
      {/* Only offered once there is a chain to break. On a first entry it would be
          a question about nothing. */}
      {lastEntry && (
        <Switch
          on={isMissed}
          onToggle={() => setIsMissed(v => !v)}
          title="Missed a fill-up before this one"
          sub="Starts the economy chain over instead of reporting a wrong figure"
        />
      )}

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Label>Date</Label>
        <input
          type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)}
          aria-label="Date of fill-up"
          style={{
            background: 'none', border: 'none', borderBottom: `1px solid ${CREAM}0.18)`, borderRadius: 0,
            padding: '4px 2px', fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
            color: `${CREAM}0.78)`, outline: 'none', colorScheme: 'dark',
          }}
        />
      </div>

      {/* Receipts. A fill-up is a cost, so it carries proof like every other cost
          in the app: the same PRIVATE bucket, the same table, the same export.
          Uploads happen after the entry is saved, because the file is filed
          under the entry's id and there is no id until then. */}
      <Label>Receipts</Label>
      {(existingReceipts.length > 0 || pendingReceipts.length > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {existingReceipts.map(r => (
            <Thumb
              key={r.id}
              src={r.file_type === 'pdf' ? null : r.url}
              label={r.file_name || 'Receipt'}
              isPdf={r.file_type === 'pdf'}
              onRemove={() => {
                setExistingReceipts(prev => prev.filter(x => x.id !== r.id))
                setRemovedReceipts(prev => [...prev, { id: r.id, file_url: r.file_url }])
              }}
            />
          ))}
          {pendingReceipts.map((r, i) => (
            <Thumb
              key={`p${i}`}
              src={r.preview}
              label={r.name}
              isPdf={!r.preview}
              onRemove={() => setPendingReceipts(prev => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </div>
      )}
      <label style={{
        display: 'block', textAlign: 'center', padding: '11px 0', cursor: 'pointer',
        border: `1px dashed ${CREAM}0.22)`, borderRadius: 0,
        fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em',
        color: `${CREAM}0.55)`,
      }}>
        <input
          type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }}
          onChange={e => {
            const files = Array.from(e.target.files || [])
            setPendingReceipts(prev => [...prev, ...files.map(f => ({
              file: f,
              preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
              name: f.name,
            }))])
            e.target.value = ''
          }}
        />
        + Attach receipt
      </label>

      {err && <Note tone="error">{err}</Note>}

      <button
        onClick={save}
        disabled={saving || !car}
        style={{
          width: '100%', marginTop: 20, height: 52, border: 'none', borderRadius: RADIUS_BUTTON,
          background: COLOR_ACCENT, color: '#fff5dc', cursor: saving ? 'default' : 'pointer',
          fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.14em',
          textTransform: 'uppercase', opacity: saving || !car ? 0.6 : 1,
        }}
      >
        {saving ? 'Saving' : 'Save fill-up'}
      </button>

      {/* Delete asks once, in place. A confirm() dialog would be the only native
          alert in the app, and a second sheet on top of this one cannot mount:
          BottomSheet is position:fixed and would anchor to whatever is already
          open. Two taps, no new surface. */}
      {editing ? (
        <button
          onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
          disabled={saving}
          style={{
            width: '100%', marginTop: 14, marginBottom: 4, background: 'none',
            border: confirmDelete ? '1px solid rgba(200,70,50,0.55)' : 'none',
            cursor: 'pointer', padding: '10px 0', borderRadius: RADIUS_BUTTON,
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
            color: confirmDelete ? '#e08a5a' : `${CREAM}0.46)`,
          }}
        >
          {confirmDelete ? 'Tap again to delete this fill-up' : 'Delete fill-up'}
        </button>
      ) : showHistoryLink ? (
        <button
          onClick={() => { onClose(); navigate('/fuel') }}
          style={{
            width: '100%', marginTop: 14, marginBottom: 4, background: 'none', border: 'none', cursor: 'pointer',
            padding: '6px 0', fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: `${CREAM}0.46)`,
          }}
        >
          View fuel history
        </button>
      ) : null}
    </BottomSheet>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      margin: '16px 0 6px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 9,
      letterSpacing: '0.16em', textTransform: 'uppercase', color: `${CREAM}0.42)`,
    }}>{children}</div>
  )
}

/** The app's concrete panel, the surface every other numeric input already uses. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: GRADIENT_PANEL, borderBottom: '2px solid #6a6a6c', borderRadius: 0,
      padding: '9px 12px', display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0,
    }}>{children}</div>
  )
}

const panelInput: React.CSSProperties = {
  flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', borderRadius: 0,
  padding: 0, fontFamily: FONT_UI, fontWeight: 700, fontSize: 21,
  letterSpacing: '-0.01em', color: COLOR_PANEL_TEXT,
}

function Unit({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: PANEL_MUTED, flexShrink: 0,
    }}>{children}</span>
  )
}

/** A receipt chip. PDFs have no preview, so they get a label plate instead of a
 *  broken image. The remove control is a real 24px target, not a 10px glyph. */
function Thumb({ src, label, isPdf, onRemove }: {
  src: string | null; label: string; isPdf: boolean; onRemove: () => void
}) {
  return (
    <div style={{ position: 'relative', width: 56 }}>
      <div style={{
        width: 56, height: 56, background: 'rgba(245,245,245,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {src && !isPdf
          ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 10, letterSpacing: '0.1em', color: `${CREAM}0.5)` }}>
              {isPdf ? 'PDF' : 'IMG'}
            </span>}
      </div>
      <span style={{
        display: 'block', marginTop: 3, fontFamily: FONT_UI, fontSize: 9, color: `${CREAM}0.38)`,
        maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
          background: '#1a1b1e', border: `1px solid ${CREAM}0.28)`, color: `${CREAM}0.8)`,
          cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
        }}
      >×</button>
    </div>
  )
}

function Note({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{
      marginTop: 7, fontFamily: FONT_UI, fontWeight: 600, fontSize: 12, lineHeight: 1.4,
      color: tone === 'error' ? '#e08a5a' : `${CREAM}0.42)`,
    }}>{children}</div>
  )
}

/** The whole row is the target, so the 26px switch never has to be hit directly. */
function Switch({ on, onToggle, title, sub }: {
  on: boolean; onToggle: () => void; title: string; sub: string
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        width: '100%', marginTop: 16, padding: '13px 0', background: 'none', border: 'none',
        borderTop: `1px solid ${CREAM}0.09)`, cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: FONT_UI, fontWeight: 600, fontSize: 15, color: '#f5f5f5' }}>{title}</span>
        <span style={{ display: 'block', marginTop: 3, fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: `${CREAM}0.40)`, lineHeight: 1.35 }}>{sub}</span>
      </span>
      <span aria-hidden style={{
        position: 'relative', width: 46, height: 26, flexShrink: 0, borderRadius: 9999,
        background: on ? COLOR_ACCENT : 'rgba(245,245,245,0.16)',
        transition: 'background 160ms ease',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%',
          background: on ? '#fff5dc' : 'rgba(245,245,245,0.55)', transition: 'left 160ms ease',
        }} />
      </span>
    </button>
  )
}
