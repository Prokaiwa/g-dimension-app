// Route: /garage/cars/new — Add Car multi-step form
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  COLOR_CAVITY_BG,
  COLOR_HEADER_BLACK,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M,
  COLOR_ACCENT,
  COLOR_PANEL_TEXT,
  GRADIENT_PANEL,
  COLOR_PANEL_LINE,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  HEADER_HEIGHT,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
  SPACE_XL,
} from '../tokens'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const _now   = new Date()
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

type FormData = {
  year: string
  make: string
  model: string
  trim: string
  nickname: string
  mileage: string
}

const EMPTY: FormData = { year: '', make: '', model: '', trim: '', nickname: '', mileage: '' }

export default function GarageCarsNewPage() {
  const navigate = useNavigate()
  const [step, setStep]     = useState(1)
  const [form, setForm]     = useState<FormData>(EMPTY)
  const [story, setStory]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const set = (k: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const step1Valid =
    form.year.trim() !== '' &&
    form.make.trim() !== '' &&
    form.model.trim() !== '' &&
    form.nickname.trim() !== '' &&
    form.mileage.trim() !== ''

  async function save() {
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setError('Not logged in.'); return }
    const { error: dbError } = await supabase.from('cars').insert({
      user_id:         user.id,
      year:            parseInt(form.year)    || null,
      make:            form.make.trim()       || null,
      model:           form.model.trim()      || null,
      trim:            form.trim.trim()       || null,
      nickname:        form.nickname.trim(),
      current_mileage: parseInt(form.mileage) || null,
      purchase_story:  story.trim()           || null,
    })
    setSaving(false)
    if (dbError) { setError(dbError.message); return }
    navigate('/garage')
  }

  // ── Shared styles ──
  const field: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: SPACE_XS,
  }
  const label: React.CSSProperties = {
    fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    color: COLOR_TEXT_SECONDARY,
  }
  const input: React.CSSProperties = {
    background: GRADIENT_PANEL,
    border: 'none',
    borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
    padding: '11px 12px',
    fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
    color: COLOR_PANEL_TEXT,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    WebkitAppearance: 'none',
  }
  const ctaBtn = (active: boolean): React.CSSProperties => ({
    width: '100%', padding: '15px',
    background: active ? COLOR_ACCENT : 'rgba(200,102,26,0.22)',
    border: 'none',
    color: active ? '#fff' : 'rgba(255,255,255,0.3)',
    fontFamily: FONT_UI, fontWeight: 800, fontSize: 13,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    cursor: active ? 'pointer' : 'default',
    transition: '200ms ease-out',
    opacity: saving ? 0.6 : 1,
  })

  return (
    <div style={{ height: '100dvh', background: COLOR_CAVITY_BG, position: 'relative', overflow: 'hidden', fontFamily: FONT_UI }}>

      {/* ── Garage door texture — thin repeating horizontal lines ── */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `repeating-linear-gradient(
          180deg,
          transparent 0px,
          transparent 34px,
          rgba(210,210,210,0.024) 34px,
          rgba(210,210,210,0.024) 35px
        )`,
      }} />
      {/* Two thicker panel dividers */}
      <div aria-hidden style={{ position: 'absolute', top: '33%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.042)', pointerEvents: 'none' }} />
      <div aria-hidden style={{ position: 'absolute', top: '67%', left: 0, right: 0, height: 2, background: 'rgba(220,215,210,0.042)', pointerEvents: 'none' }} />

      {/* ── Floor spotlight — warm circular glow at bottom ── */}
      <div aria-hidden style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%', pointerEvents: 'none',
        background: 'radial-gradient(ellipse 65% 50% at 50% 100%, rgba(238,235,224,0.14) 0%, rgba(238,235,224,0.04) 50%, transparent 100%)',
      }} />

      {/* ── Header ── */}
      <div style={{
        position: 'relative', height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: 10, paddingRight: 14,
        flexShrink: 0, zIndex: 10,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* Back + "Garage" display title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => step === 2 ? setStep(1) : navigate('/garage')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px 8px 4px 4px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          </button>
          <span style={{
            fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
            fontSize: 22, color: COLOR_HEADER_TITLE, letterSpacing: '0.01em',
          }}>
            Garage
          </span>
        </div>

        {/* GT-style date badge — [MAY][04] connected tiles */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{
            background: 'rgba(242,238,228,0.94)',
            color: '#0d0d0d',
            padding: '4px 7px',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center',
          }}>
            {MONTH_LABEL}
          </div>
          <div style={{
            background: COLOR_BURGUNDY_M,
            color: '#ffffff',
            padding: '4px 8px',
            fontFamily: FONT_UI, fontWeight: 800, fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: DAY_LABEL.length === 1 ? 24 : 30,
          }}>
            {DAY_LABEL}
          </div>
        </div>
      </div>

      {/* ── Scrollable form content ── */}
      <div style={{
        position: 'absolute',
        top: HEADER_HEIGHT, bottom: 0, left: 0, right: 0,
        overflowY: 'auto',
        padding: `${SPACE_LG}px ${SPACE_MD}px 140px`,
      }}>

        {/* Step progress bars */}
        <div style={{ display: 'flex', gap: SPACE_XS, marginBottom: SPACE_LG, alignItems: 'center' }}>
          <div style={{ flex: 1, height: 2, background: step >= 1 ? COLOR_ACCENT : 'rgba(255,255,255,0.1)', transition: '300ms ease' }} />
          <div style={{ flex: 1, height: 2, background: step >= 2 ? COLOR_ACCENT : 'rgba(255,255,255,0.1)', transition: '300ms ease' }} />
          <span style={{
            fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
            letterSpacing: '0.1em', color: COLOR_TEXT_SECONDARY,
            textTransform: 'uppercase', paddingLeft: SPACE_XS, flexShrink: 0,
          }}>
            {step} / 2
          </span>
        </div>

        {/* Heading */}
        <p style={{
          fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600,
          fontSize: 26, color: COLOR_HEADER_TITLE,
          margin: `0 0 ${SPACE_LG}px`,
          lineHeight: 1.15,
        }}>
          {step === 1 ? 'Tell us about\nyour car.' : "What's the story?"}
        </p>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_MD }}>

            {/* Year + Make */}
            <div style={{ display: 'flex', gap: SPACE_SM }}>
              <div style={{ ...field, flex: '0 0 86px' }}>
                <span style={label}>Year</span>
                <input
                  type="number" inputMode="numeric"
                  placeholder="2003"
                  value={form.year} onChange={set('year')}
                  style={input}
                />
              </div>
              <div style={{ ...field, flex: 1 }}>
                <span style={label}>Make</span>
                <input
                  type="text" autoCapitalize="words"
                  placeholder="Mitsubishi"
                  value={form.make} onChange={set('make')}
                  style={input}
                />
              </div>
            </div>

            {/* Model + Trim */}
            <div style={{ display: 'flex', gap: SPACE_SM }}>
              <div style={{ ...field, flex: 1 }}>
                <span style={label}>Model</span>
                <input
                  type="text" autoCapitalize="words"
                  placeholder="Lancer"
                  value={form.model} onChange={set('model')}
                  style={input}
                />
              </div>
              <div style={{ ...field, flex: 1 }}>
                <span style={label}>
                  Trim
                  <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 4, letterSpacing: 0, textTransform: 'none', fontSize: 9 }}>optional</span>
                </span>
                <input
                  type="text" autoCapitalize="words"
                  placeholder="Evolution IV"
                  value={form.trim} onChange={set('trim')}
                  style={input}
                />
              </div>
            </div>

            {/* Nickname */}
            <div style={field}>
              <span style={label}>Nickname</span>
              <input
                type="text" autoCapitalize="words"
                placeholder="Project Evo"
                value={form.nickname} onChange={set('nickname')}
                style={input}
              />
            </div>

            {/* Mileage */}
            <div style={field}>
              <span style={label}>Current Mileage</span>
              <input
                type="number" inputMode="numeric"
                placeholder="87000"
                value={form.mileage} onChange={set('mileage')}
                style={input}
              />
            </div>

          </div>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
            <textarea
              placeholder={`How did you find it?\nWhat does it mean to you?\nHow long have you had it?`}
              value={story}
              onChange={e => setStory(e.target.value)}
              rows={7}
              style={{
                ...input,
                resize: 'none',
                lineHeight: 1.65,
              } as React.CSSProperties}
            />
            <p style={{
              fontFamily: FONT_UI, fontSize: 11,
              color: COLOR_TEXT_SECONDARY, margin: 0,
              lineHeight: 1.5,
            }}>
              This lives in your car's origin story. You can always add it later.
            </p>
          </div>
        )}

        {error && (
          <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_MD }}>
            {error}
          </p>
        )}
      </div>

      {/* ── Fixed CTA ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_XL}px`,
        background: 'linear-gradient(0deg, rgba(5,5,7,0.96) 0%, rgba(5,5,7,0.7) 70%, transparent 100%)',
        display: 'flex', flexDirection: 'column', gap: SPACE_SM,
        zIndex: 5,
      }}>
        {step === 1 && (
          <button
            disabled={!step1Valid}
            onClick={() => setStep(2)}
            style={ctaBtn(step1Valid)}
          >
            Next
          </button>
        )}

        {step === 2 && (
          <>
            <button
              disabled={saving}
              onClick={save}
              style={ctaBtn(true)}
            >
              {saving ? 'Placing in garage…' : 'Place in Garage'}
            </button>
            <button
              disabled={saving}
              onClick={save}
              style={{
                width: '100%', padding: '10px',
                background: 'none', border: 'none',
                color: COLOR_TEXT_SECONDARY,
                fontFamily: FONT_UI, fontWeight: 600, fontSize: 12,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              Skip Story
            </button>
          </>
        )}
      </div>

    </div>
  )
}
