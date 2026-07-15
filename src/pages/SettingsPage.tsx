// Route: /settings — Settings, reached from within Profile (Part 10, Part 13).
// Unit display preferences (distance / power / torque) write straight to the
// `users` row — data is always stored in base units, this only changes display
// (see migration 001 / Part 16). Settings live inside Profile per CLAUDE.md.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isSoundEnabled, setSoundEnabled, playConfirm } from '../lib/sound'
import { isMusicEnabled, setMusicEnabled } from '../lib/music'
import { downloadAccountExport } from '../lib/dataExport'
import { useTour } from '../tour/TourContext'
import BottomSheet, { FieldLabel, sheetInput } from '../components/BottomSheet'
import {
  GRADIENT_APP_BG,
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

const _now   = new Date()
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const CREAM = '#f0e4c8'
const MUTED = 'rgba(240,228,200,0.5)'
const FAINT = 'rgba(240,228,200,0.32)'

// The thank-you note behind the "Do Not Click On This" row — David's words, verbatim.
const THANK_YOU =
  "Why the hell did you click on this?! Well, while you're here, I just wanted to tell you how thankful I am for using G-Dimension. As technology keeps improving, I wanted to share a space for people to be able to keep cataloging builds, sharing info, and giving inspiration to other car enthusiasts. Car culture needs to be preserved and to be documented, and I wanted to have a place where you could have it all. If it weren't for like-minded people like yourselves, I wouldn't have the amazing relationships I've built over the years. To meet someone in a parking lot and compliment each other's car and have that naturally grow into different friend groups is something absolutely amazing. So from the bottom of my heart, thank you."

type UnitPrefs = {
  distance_unit: 'mi' | 'km'
  power_unit: 'hp' | 'ps' | 'kw'
  torque_unit: 'lbft' | 'nm'
}

const DISTANCE_OPTS = [
  { value: 'mi', label: 'mi' },
  { value: 'km', label: 'km' },
] as const
const POWER_OPTS = [
  { value: 'hp', label: 'hp' },
  { value: 'ps', label: 'PS' },
  { value: 'kw', label: 'kW' },
] as const
const TORQUE_OPTS = [
  { value: 'lbft', label: 'lb-ft' },
  { value: 'nm', label: 'Nm' },
] as const
const SOUND_OPTS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
] as const

// A labelled segmented control. Tapping a segment commits immediately.
function UnitRow<T extends string>({
  label, sub, value, options, onPick, disabled,
}: {
  label: string
  sub: string
  value: T
  options: readonly { value: T; label: string }[]
  onPick: (v: T) => void
  disabled: boolean
}) {
  return (
    <div style={{ padding: `${SPACE_MD}px 0`, borderBottom: '1px solid rgba(240,228,200,0.07)' }}>
      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: CREAM, margin: 0, lineHeight: 1.2 }}>{label}</p>
      <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '3px 0 0' }}>{sub}</p>
      <div style={{ display: 'flex', marginTop: SPACE_MD, border: '1px solid rgba(240,228,200,0.16)' }}>
        {options.map((opt, i) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              onClick={() => !active && onPick(opt.value)}
              disabled={disabled}
              style={{
                flex: 1, minHeight: 44, padding: '0 4px',
                background: active ? COLOR_ACCENT : 'transparent',
                border: 'none',
                borderLeft: i === 0 ? 'none' : '1px solid rgba(240,228,200,0.16)',
                cursor: disabled || active ? 'default' : 'pointer',
                color: active ? '#fff5dc' : MUTED,
                fontFamily: FONT_UI, fontWeight: active ? 800 : 600, fontSize: 13,
                letterSpacing: '0.02em',
                transition: 'background 160ms ease, color 160ms ease',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// A tappable navigation row, mirroring the Profile screen's NavRow.
function NavRow({ label, sub, onClick }: { label: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: SPACE_MD, padding: '14px 0',
      background: 'none', border: 'none', borderBottom: '1px solid rgba(240,228,200,0.07)',
      cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: CREAM, margin: 0, lineHeight: 1.2 }}>{label}</p>
        {sub && <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: '3px 0 0' }}>{sub}</p>}
      </div>
      <span style={{ flexShrink: 0, color: FAINT, fontSize: 20, lineHeight: 1 }}>›</span>
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `${SPACE_XL}px 0 ${SPACE_XS}px` }}>
      {children}
    </p>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { replay } = useTour()
  const [uid, setUid] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<UnitPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [eggOpen, setEggOpen] = useState(false)
  const [sound, setSound] = useState(isSoundEnabled())
  const [music, setMusic] = useState(isMusicEnabled())
  const [exportState, setExportState] = useState<'idle' | 'working' | 'error'>('idle')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const id = auth?.user?.id ?? null
      if (!id) { if (!cancelled) setLoading(false); return }
      const { data } = await supabase
        .from('users')
        .select('distance_unit, power_unit, torque_unit')
        .eq('id', id)
        .single()
      if (cancelled) return
      setUid(id)
      setPrefs((data as UnitPrefs) ?? { distance_unit: 'mi', power_unit: 'hp', torque_unit: 'lbft' })
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Commit a single unit preference. Optimistic — revert on failure.
  async function update<K extends keyof UnitPrefs>(key: K, value: UnitPrefs[K]) {
    if (!uid || !prefs || prefs[key] === value) return
    const prev = prefs
    setPrefs({ ...prefs, [key]: value })
    setSaving(true)
    const { error } = await supabase.from('users').update({ [key]: value }).eq('id', uid)
    setSaving(false)
    if (error) setPrefs(prev)
  }

  // Device-local — sound is a per-phone preference, not a profile column.
  function pickSound(v: 'on' | 'off') {
    const on = v === 'on'
    setSound(on)
    setSoundEnabled(on)
    if (on) playConfirm()
  }

  // Background music — device-local, separate from menu sounds.
  function pickMusic(v: 'on' | 'off') {
    const on = v === 'on'
    setMusic(on)
    setMusicEnabled(on) // starts/stops the loop immediately
  }

  // Download all of the user's rows as one JSON file (client-side, read-only).
  async function handleExport() {
    if (exportState === 'working') return
    setExportState('working')
    try {
      await downloadAccountExport()
      setExportState('idle')
    } catch {
      setExportState('error')
      setTimeout(() => setExportState('idle'), 4000)
    }
  }

  // Permanently deletes the account server-side (Edge Function — needs the
  // service role key to remove storage files + call the Auth admin API, so
  // it can't run from the client). Cascades every DB row via FK; see
  // supabase/functions/delete-account/index.ts.
  async function confirmDeleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleting) return
    setDeleting(true)
    setDeleteError('')
    const { data, error } = await supabase.functions.invoke('delete-account')
    if (error || (data as { error?: string } | null)?.error) {
      setDeleting(false)
      setDeleteError('Could not delete your account — please try again, or contact hi@gdimension.app.')
      return
    }
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: GRADIENT_APP_BG, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <style>{`@keyframes settingsIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* ── Header ── */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, flexShrink: 0, zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => navigate('/profile')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 4px', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em' }}>Settings</span>
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
            <span style={{ fontFamily: FONT_UI, fontSize: 12, color: FAINT, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
          </div>
        )}

        {!loading && prefs && (
          <div style={{ padding: `${SPACE_LG}px ${SPACE_MD}px calc(${SPACE_XL}px + env(safe-area-inset-bottom))`, animation: `settingsIn 360ms ${EASING_SETTLE} both` }}>

            {/* Units */}
            <p style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: FAINT, margin: `0 0 ${SPACE_XS}px` }}>Units</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 12, color: MUTED, margin: `0 0 ${SPACE_SM}px`, lineHeight: 1.5 }}>
              Display only — your numbers are always stored in base units and converted on the fly.
            </p>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <UnitRow label="Distance" sub="Mileage, odometer, service intervals" value={prefs.distance_unit} options={DISTANCE_OPTS} onPick={v => update('distance_unit', v)} disabled={saving} />
              <UnitRow label="Power" sub="Horsepower figures across your builds" value={prefs.power_unit} options={POWER_OPTS} onPick={v => update('power_unit', v)} disabled={saving} />
              <UnitRow label="Torque" sub="Torque figures across your builds" value={prefs.torque_unit} options={TORQUE_OPTS} onPick={v => update('torque_unit', v)} disabled={saving} />
            </div>

            {/* Sound */}
            <SectionLabel>Sound</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <UnitRow
                label="Menu Sounds"
                sub="GT-style ticks on the Home map — synthesized on this device, saved to this device"
                value={sound ? 'on' : 'off'}
                options={SOUND_OPTS}
                onPick={pickSound}
                disabled={false}
              />
              <UnitRow
                label="Background Music"
                sub="A low ambient loop while you browse — saved to this device"
                value={music ? 'on' : 'off'}
                options={SOUND_OPTS}
                onPick={pickMusic}
                disabled={false}
              />
            </div>

            {/* Help */}
            <SectionLabel>Help</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="Replay App Tour" sub="Take the guided walkthrough again from the Home map" onClick={replay} />
            </div>

            {/* Cars */}
            <SectionLabel>Cars</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="Archived Cars" sub="Restore within 7 days of archiving" onClick={() => navigate('/settings/archived')} />
            </div>

            {/* Legal */}
            <SectionLabel>Legal</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="Terms of Service" onClick={() => navigate('/terms')} />
              <NavRow label="Privacy Policy" onClick={() => navigate('/privacy')} />
            </div>

            {/* Your Data */}
            <SectionLabel>Your Data</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow
                label={exportState === 'working' ? 'Preparing your file…' : 'Download My Data'}
                sub={exportState === 'error'
                  ? 'Something went wrong — please try again'
                  : 'Export all your cars, mods, records, and photo links as a JSON file'}
                onClick={handleExport}
              />
            </div>

            {/* Account */}
            <SectionLabel>Account</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="Delete Account" sub="Permanently erase your builds, photos, and profile" onClick={() => setDeleteOpen(true)} />
            </div>

            {/* The one row you shouldn't touch. */}
            <SectionLabel>&nbsp;</SectionLabel>
            <div style={{ borderTop: '1px solid rgba(240,228,200,0.07)' }}>
              <NavRow label="Do Not Click On This" onClick={() => setEggOpen(true)} />
            </div>

          </div>
        )}
      </div>

      {/* ── Easter egg ── */}
      <BottomSheet open={eggOpen} onClose={() => setEggOpen(false)} title="Thank You">
        <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 500, fontSize: 19, color: 'rgba(240,228,200,0.85)', lineHeight: 1.6, margin: `0 0 ${SPACE_LG}px` }}>
          {THANK_YOU}
        </p>
        <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 18, color: COLOR_ACCENT, textAlign: 'right', margin: 0 }}>
          — David Scantee
        </p>
      </BottomSheet>

      {/* ── Delete account ── */}
      <BottomSheet
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteConfirmText(''); setDeleteError('') }}
        title="Delete Account"
        busy={deleting}
      >
        <p style={{ fontFamily: FONT_UI, fontSize: 14, color: 'rgba(240,228,200,0.75)', lineHeight: 1.6, margin: `0 0 ${SPACE_MD}px` }}>
          This permanently deletes your account — every car, mod, service record, timeline entry, photo, and receipt. There is no undo.
        </p>
        <FieldLabel>Type DELETE to confirm</FieldLabel>
        <input
          value={deleteConfirmText}
          onChange={e => setDeleteConfirmText(e.target.value)}
          placeholder="DELETE"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={deleting}
          style={{ ...sheetInput, marginBottom: SPACE_MD }}
        />
        {deleteError && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: COLOR_ACCENT, margin: `0 0 ${SPACE_MD}px` }}>{deleteError}</p>
        )}
        <button
          onClick={confirmDeleteAccount}
          disabled={deleteConfirmText.trim().toUpperCase() !== 'DELETE' || deleting}
          style={{
            width: '100%', padding: '14px', border: 'none',
            background: deleteConfirmText.trim().toUpperCase() === 'DELETE' ? COLOR_ACCENT : 'rgba(200,102,26,0.25)',
            color: '#fff', fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase',
            cursor: deleteConfirmText.trim().toUpperCase() === 'DELETE' && !deleting ? 'pointer' : 'default',
            opacity: deleting ? 0.7 : 1, transition: '200ms ease-out',
          }}
        >
          {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
        </button>
      </BottomSheet>
    </div>
  )
}
