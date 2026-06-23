// Route: /tuning/mods/:modId/diy/edit — Create/edit a DIY guide for a mod
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'
import { getYouTubeId, getYouTubeThumbnail } from '../lib/links'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, HEADER_HEIGHT, RADIUS_BUTTON } from '../tokens'

// ── DIY aesthetic tokens ───────────────────────────────────────────────────
const BG = '#f0efec'
const CARD = '#ffffff'
const BORDER = 'rgba(0,0,0,0.07)'
const DARK = '#1c1c1a'
const MID = 'rgba(28,28,26,0.5)'
const FAINT = 'rgba(28,28,26,0.22)'
const ACCENT = COLOR_ACCENT
const STEP_NUM_BG = '#1c1c1a'

const COMPRESSION_OPTIONS = {
  maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true,
  exifOrientation: -1 as const, fileType: 'image/jpeg',
}

// ── Types ──────────────────────────────────────────────────────────────────
type StepPhoto = {
  id?: string
  step_id?: string
  photo_url?: string
  caption: string
  display_order: number
  _file?: File
  _preview?: string
  _deleted?: boolean
}

type Step = {
  id?: string
  step_order: number
  title: string
  description: string
  photos: StepPhoto[]
}

// ── Star helpers ───────────────────────────────────────────────────────────
const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

function difficultyLabel(d: number | null): string {
  if (d === null) return 'Not set'
  if (d <= 1.5) return 'Beginner'
  if (d <= 2.5) return 'Easy'
  if (d === 3.0) return 'Intermediate'
  if (d <= 4.0) return 'Hard'
  return 'Expert'
}

function StarSelector({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const display = value ?? 0
  return (
    <div>
      {/* Star display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {[1, 2, 3, 4, 5].map(n => {
            const fill = display === 0 ? 0 : Math.min(1, Math.max(0, display - (n - 1)))
            const fillPct = fill === 0 ? 0 : fill >= 1 ? 100 : 50
            const uid = `star-clip-edit-${n}`
            return (
              <div key={n} style={{ position: 'relative', width: 28, height: 28 }}>
                <svg width={28} height={28} viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <path d={STAR_PATH} fill={FAINT} stroke="none" />
                </svg>
                {fillPct > 0 && (
                  <svg width={28} height={28} viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
                    <defs>
                      <clipPath id={uid}>
                        <rect x={0} y={0} width={fillPct === 100 ? 24 : 12} height={24} />
                      </clipPath>
                    </defs>
                    <path d={STAR_PATH} fill={ACCENT} stroke="none" clipPath={`url(#${uid})`} />
                  </svg>
                )}
              </div>
            )
          })}
        </div>
        <span style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 600, color: value ? DARK : MID }}>
          {value ? `${difficultyLabel(value)} (${value.toFixed(1)})` : 'Not set'}
        </span>
      </div>
      {/* Slider rail */}
      <div style={{ position: 'relative' }}>
        <style>{`
          .diy-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 44px; outline: none; background: transparent; cursor: pointer; margin: 0; touch-action: none; }
          .diy-slider::-webkit-slider-runnable-track { height: 8px; border-radius: 4px; background: linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${((display - 1) / 4) * 100}%, ${FAINT} ${((display - 1) / 4) * 100}%, ${FAINT} 100%); }
          .diy-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 32px; height: 32px; border-radius: 50%; background: ${ACCENT}; border: 3px solid #fff; margin-top: -12px; box-shadow: 0 1px 5px rgba(0,0,0,0.3); }
          .diy-slider::-moz-range-track { height: 8px; border-radius: 4px; background: ${FAINT}; }
          .diy-slider::-moz-range-progress { height: 8px; border-radius: 4px; background: ${ACCENT}; }
          .diy-slider::-moz-range-thumb { width: 32px; height: 32px; border-radius: 50%; background: ${ACCENT}; border: 3px solid #fff; box-shadow: 0 1px 5px rgba(0,0,0,0.3); }
        `}</style>
        <input
          type="range"
          className="diy-slider"
          min={1}
          max={5}
          step={0.5}
          value={display || 1}
          onChange={e => onChange(parseFloat(e.target.value))}
        />
        {/* Tick labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} style={{ fontFamily: FONT_UI, fontSize: 11, color: MID, width: 20, textAlign: 'center' }}>{n}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13,
        background: value ? ACCENT : FAINT,
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

// ── Caption modal ──────────────────────────────────────────────────────────
type CaptionTarget = { stepIdx: number; photoIdx: number; value: string }

function CaptionModal({ target, onSave, onClose }: {
  target: CaptionTarget
  onSave: (stepIdx: number, photoIdx: number, v: string) => void
  onClose: () => void
}) {
  const [val, setVal] = useState(target.value)
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div
        style={{ position: 'relative', background: CARD, padding: '20px 20px 36px', borderTop: `2px solid ${BORDER}` }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MID, margin: '0 0 10px' }}>PHOTO CAPTION</p>
        <textarea
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="Describe what's in this photo…"
          autoFocus
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: FONT_UI, fontSize: 16, color: DARK,
            background: BG, border: `1px solid ${FAINT}`,
            borderRadius: 0, padding: '10px 12px', outline: 'none',
            resize: 'none', lineHeight: '1.5',
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 46, background: 'none', border: `1px solid ${FAINT}`, cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: MID, borderRadius: RADIUS_BUTTON }}
          >Cancel</button>
          <button
            onClick={() => { onSave(target.stepIdx, target.photoIdx, val); onClose() }}
            style={{ flex: 2, height: 46, background: DARK, border: 'none', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 14, color: '#f5f5f5', borderRadius: RADIUS_BUTTON, letterSpacing: '0.06em' }}
          >SAVE CAPTION</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TuningDiyEditPage() {
  const { modId } = useParams<{ modId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('Saving…')
  const [error, setError] = useState<string | null>(null)
  const [modTitle, setModTitle] = useState('')
  const [carId, setCarId] = useState<string | null>(null)
  const [guideId, setGuideId] = useState<string | undefined>(undefined)
  const [addTimeline, setAddTimeline] = useState(false)
  const [timelineAdded, setTimelineAdded] = useState(false)

  const [difficulty, setDifficulty] = useState<number | null>(null)
  const [estimatedTime, setEstimatedTime] = useState('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [toolInput, setToolInput] = useState('')

  const [captionModal, setCaptionModal] = useState<CaptionTarget | null>(null)
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  useEffect(() => {
    if (!modId) return
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: job, error: jobErr } = await supabase
          .from('jobs').select('id,title,car_id').eq('id', modId).single()
        if (jobErr || !job) throw new Error('Mod not found')
        setModTitle(job.title)
        setCarId(job.car_id)

        const { data: g } = await supabase
          .from('diy_guides').select('*').eq('job_id', modId).maybeSingle()

        if (g) {
          setGuideId(g.id)

          // Check if a timeline entry was already added for this guide
          const { data: existing } = await supabase
            .from('timeline_entries')
            .select('id')
            .eq('car_id', job.car_id)
            .eq('entry_type', 'note')
            .ilike('title', `DIY Guide:%`)
            .eq('title', `DIY Guide: ${job.title}`)
            .maybeSingle()
          if (existing) setTimelineAdded(true)

          setDifficulty(g.difficulty ?? null)
          setEstimatedTime(g.estimated_time ?? '')
          setYoutubeUrl(g.youtube_url ?? '')
          setTools(g.tools ?? [])

          const { data: rawSteps } = await supabase
            .from('diy_steps').select('id,step_order,title,description')
            .eq('guide_id', g.id).order('step_order')

          const stepIds = (rawSteps ?? []).map((s: { id: string }) => s.id)
          const { data: photos } = stepIds.length
            ? await supabase.from('diy_step_photos')
                .select('id,step_id,photo_url,caption,display_order')
                .in('step_id', stepIds).order('display_order')
            : { data: [] }

          setSteps((rawSteps ?? []).map((s: { id: string; step_order: number; title: string; description: string }) => ({
            id: s.id,
            step_order: s.step_order,
            title: s.title ?? '',
            description: s.description ?? '',
            photos: ((photos ?? []) as Array<{ id: string; step_id: string; photo_url: string; caption: string | null; display_order: number | null }>)
              .filter(p => p.step_id === s.id)
              .map(p => ({
                id: p.id,
                step_id: p.step_id,
                photo_url: p.photo_url,
                caption: p.caption ?? '',
                display_order: p.display_order ?? 0,
              })),
          })))
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [modId])

  const addTool = useCallback((raw: string) => {
    const tool = raw.replace(/,$/, '').trim()
    if (!tool) return
    setTools(prev => prev.includes(tool) ? prev : [...prev, tool])
    setToolInput('')
  }, [])

  const handleToolKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTool(toolInput)
    }
  }

  const addStep = () => {
    setSteps(s => [...s, { step_order: s.length + 1, title: '', description: '', photos: [] }])
  }

  const removeStep = (idx: number) => {
    setSteps(s => s.filter((_, i) => i !== idx).map((st, i) => ({ ...st, step_order: i + 1 })))
  }

  const moveStep = (idx: number, dir: 1 | -1) => {
    setSteps(s => {
      const next = [...s]
      const target = idx + dir
      if (target < 0 || target >= next.length) return s
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next.map((st, i) => ({ ...st, step_order: i + 1 }))
    })
  }

  const updateStep = (idx: number, field: 'title' | 'description', value: string) => {
    setSteps(s => s.map((st, i) => i === idx ? { ...st, [field]: value } : st))
  }

  const addPhotosToStep = (idx: number, files: FileList) => {
    const newPhotos: StepPhoto[] = Array.from(files).map((f, i) => ({
      caption: '',
      display_order: 1000 + i,
      _file: f,
      _preview: URL.createObjectURL(f),
    }))
    setSteps(s => s.map((st, i) => i === idx
      ? { ...st, photos: [...st.photos, ...newPhotos] }
      : st))
  }

  const removePhoto = (stepIdx: number, realPhotoIdx: number) => {
    setSteps(s => s.map((st, i) => i !== stepIdx ? st : {
      ...st,
      photos: st.photos.map((p, j) => j === realPhotoIdx ? { ...p, _deleted: true } : p),
    }))
  }

  const updatePhotoCaption = (stepIdx: number, realPhotoIdx: number, caption: string) => {
    setSteps(s => s.map((st, i) => i !== stepIdx ? st : {
      ...st,
      photos: st.photos.map((p, j) => j === realPhotoIdx ? { ...p, caption } : p),
    }))
  }

  const handleSave = async () => {
    if (!modId || !carId) return
    setSaving(true)
    setSaveMsg('Saving guide…')
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const guidePayload = {
        job_id: modId,
        car_id: carId,
        difficulty,
        estimated_time: estimatedTime || null,
        youtube_url: youtubeUrl || null,
        tools,
        updated_at: new Date().toISOString(),
      }

      let finalGuideId = guideId
      if (guideId) {
        const { error: uErr } = await supabase.from('diy_guides').update(guidePayload).eq('id', guideId)
        if (uErr) throw uErr
      } else {
        const { data: ins, error: iErr } = await supabase
          .from('diy_guides').insert(guidePayload).select('id').single()
        if (iErr) throw iErr
        finalGuideId = ins.id
        setGuideId(finalGuideId)
      }

      // Delete removed steps
      const currentStepIds = new Set(steps.filter(s => s.id).map(s => s.id!))
      if (guideId) {
        const { data: existingSteps } = await supabase
          .from('diy_steps').select('id').eq('guide_id', guideId)
        const toDelete = ((existingSteps ?? []) as Array<{ id: string }>)
          .filter(s => !currentStepIds.has(s.id)).map(s => s.id)
        if (toDelete.length > 0) {
          await supabase.from('diy_steps').delete().in('id', toDelete)
        }
      }

      // Upsert step rows first (sequential — each new row yields the id photos need)
      const stepIds: string[] = []
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i]
        const stepPayload = {
          guide_id: finalGuideId!,
          car_id: carId,
          step_order: i + 1,
          title: st.title,
          description: st.description,
        }
        if (st.id) {
          await supabase.from('diy_steps').update(stepPayload).eq('id', st.id)
          stepIds[i] = st.id
        } else {
          const { data: ins, error: insErr } = await supabase
            .from('diy_steps').insert(stepPayload).select('id').single()
          if (insErr) throw insErr
          stepIds[i] = ins.id
        }
      }

      // Photo work — run all uploads / deletes / caption updates in parallel.
      setSaveMsg('Saving photos…')
      const photoOps: PromiseLike<unknown>[] = []
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i]
        const stepId = stepIds[i]

        const deletedPhotoIds = st.photos.filter(p => p._deleted && p.id).map(p => p.id!)
        if (deletedPhotoIds.length > 0) {
          photoOps.push(supabase.from('diy_step_photos').delete().in('id', deletedPhotoIds))
        }

        for (const photo of st.photos.filter(p => !p._deleted && p._file)) {
          photoOps.push((async () => {
            const compressed = await imageCompression(photo._file!, COMPRESSION_OPTIONS)
            const rand = Math.random().toString(36).slice(2)
            const path = `${user.id}/${carId}/diy/${finalGuideId}/${stepId}/${Date.now()}-${rand}.jpg`
            const { error: upErr } = await supabase.storage.from('job-photos').upload(path, compressed)
            if (upErr) throw upErr
            const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path)
            return supabase.from('diy_step_photos').insert({
              step_id: stepId,
              car_id: carId,
              photo_url: urlData.publicUrl,
              caption: photo.caption || null,
              display_order: photo.display_order,
            })
          })())
        }

        for (const photo of st.photos.filter(p => !p._deleted && p.id)) {
          photoOps.push(
            supabase.from('diy_step_photos')
              .update({ caption: photo.caption || null })
              .eq('id', photo.id!)
          )
        }
      }
      await Promise.all(photoOps)

      if (addTimeline && !timelineAdded) {
        await supabase.from('timeline_entries').insert({
          car_id: carId,
          entry_type: 'note',
          title: `DIY Guide: ${modTitle}`,
          display_date: new Date().toISOString().slice(0, 10),
          session_id: null,
          is_origin: false,
        })
        setTimelineAdded(true)
      }

      navigate(`/tuning/mods/${modId}/diy`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const ytId = getYouTubeId(youtubeUrl)
  const ytThumb = ytId ? getYouTubeThumbnail(ytId) : null

  const cardStyle: React.CSSProperties = {
    background: CARD, border: `1px solid ${BORDER}`,
    padding: 16, marginBottom: 12,
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: FONT_UI, fontSize: 10, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase',
    color: MID, marginBottom: 8, display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    fontFamily: FONT_UI, fontSize: 16, color: DARK,
    background: BG, border: `1px solid ${FAINT}`,
    borderRadius: 0, padding: '10px 12px', outline: 'none',
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle, minHeight: 80, resize: 'none', lineHeight: '1.5',
  }

  if (loading) return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: FONT_UI, color: MID, fontSize: 13 }}>Loading…</span>
    </div>
  )

  return (
    <div style={{ background: BG, minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{
        height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center', paddingLeft: 4, paddingRight: 16,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <button
          onClick={() => navigate(`/tuning/mods/${modId}`)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#f0e4c8', fontSize: 24, padding: '0 8px',
            minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center',
          }}
        >‹</button>
        <span style={{
          fontFamily: FONT_UI, fontSize: 15, fontWeight: 700,
          color: '#ffffff', flex: 1, letterSpacing: '0.02em',
        }}>DIY Guide</span>
        <span style={{
          fontFamily: FONT_UI, fontSize: 14, fontWeight: 800, fontStyle: 'italic',
          color: '#ffffff', letterSpacing: '0.12em',
        }}>G-DIMENSION</span>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        {/* Mod title display */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_UI, fontSize: 10, color: MID, margin: '0 0 4px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>GUIDE FOR</p>
          <p style={{ fontFamily: FONT_UI, fontSize: 20, fontWeight: 700, fontStyle: 'italic', color: DARK, margin: 0 }}>{modTitle || '…'}</p>
        </div>

        {error && (
          <div style={{ background: '#fdecea', border: '1px solid rgba(200,0,0,0.2)', padding: '10px 12px', marginBottom: 12 }}>
            <span style={{ fontFamily: FONT_UI, fontSize: 13, color: '#721c24' }}>{error}</span>
          </div>
        )}

        {/* YouTube */}
        <div style={cardStyle}>
          <label style={labelStyle}>Tutorial Video (optional)</label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={e => setYoutubeUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            style={inputStyle}
          />
          {ytThumb && (
            <div style={{ marginTop: 10 }}>
              <img src={ytThumb} alt="YouTube preview"
                style={{ width: 120, height: 68, objectFit: 'cover', border: `1px solid ${BORDER}`, display: 'block' }} />
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div style={cardStyle}>
          <label style={labelStyle}>Difficulty</label>
          <StarSelector value={difficulty} onChange={setDifficulty} />
        </div>

        {/* Estimated time */}
        <div style={cardStyle}>
          <label style={labelStyle}>Estimated Time</label>
          <input
            type="text"
            value={estimatedTime}
            onChange={e => setEstimatedTime(e.target.value)}
            placeholder="e.g. 2–3 hours"
            style={inputStyle}
          />
        </div>

        {/* Tools */}
        <div style={cardStyle}>
          <label style={labelStyle}>Tools Needed</label>
          {tools.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {tools.map(t => (
                <div key={t} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: '#e8e5e0', padding: '4px 8px', borderRadius: 0,
                }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: 13, color: DARK }}>{t}</span>
                  <button
                    onClick={() => setTools(prev => prev.filter(x => x !== t))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: MID, fontSize: 15, padding: '0 0 0 2px', lineHeight: 1, minWidth: 20, minHeight: 20 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <input
            type="text"
            value={toolInput}
            onChange={e => setToolInput(e.target.value)}
            onKeyDown={handleToolKeyDown}
            onBlur={() => addTool(toolInput)}
            placeholder="Type a tool, press Enter or comma"
            style={inputStyle}
          />
          <p style={{ fontFamily: FONT_UI, fontSize: 11, color: FAINT, marginTop: 6, marginBottom: 0 }}>Press Enter or , to add each tool</p>
        </div>

        {/* Steps */}
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: MID, marginBottom: 10, marginTop: 4 }}>STEPS</p>
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{
                background: CARD,
                border: `1px solid ${BORDER}`,
                borderBottom: idx < steps.length - 1 ? '2px solid #8b2335' : `1px solid ${BORDER}`,
                padding: 16,
                marginBottom: idx < steps.length - 1 ? 0 : 12,
              }}
            >
              {/* Step header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  width: 28, height: 28, background: STEP_NUM_BG, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: '#f5f5f5' }}>{idx + 1}</span>
                </div>
                <input
                  type="text"
                  value={step.title}
                  onChange={e => updateStep(idx, 'title', e.target.value)}
                  placeholder={`Step ${idx + 1} title`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? FAINT : MID, fontSize: 13, width: 28, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >▲</button>
                  <button
                    onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                    style={{ background: 'none', border: 'none', cursor: idx === steps.length - 1 ? 'default' : 'pointer', color: idx === steps.length - 1 ? FAINT : MID, fontSize: 13, width: 28, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >▼</button>
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MID, fontSize: 18, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >✕</button>
              </div>

              {/* Description */}
              <textarea
                value={step.description}
                onChange={e => updateStep(idx, 'description', e.target.value)}
                placeholder="Describe this step…"
                style={textareaStyle}
                rows={3}
              />

              {/* Photos */}
              <div style={{ marginTop: 12 }}>
                <p style={{ fontFamily: FONT_UI, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: MID, margin: '0 0 8px' }}>PHOTOS</p>
                {step.photos.some(p => !p._deleted) && (
                  <div style={{ display: 'flex', overflowX: 'auto', gap: 8, paddingBottom: 6, marginBottom: 6 }}>
                    {step.photos.map((photo, pIdx) => {
                      if (photo._deleted) return null
                      return (
                        <div key={pIdx} style={{ flexShrink: 0 }}>
                          <div style={{ position: 'relative', width: 80, height: 80 }}>
                            <img
                              src={photo._preview ?? photo.photo_url}
                              alt=""
                              style={{ width: 80, height: 80, objectFit: 'cover', border: `1px solid ${BORDER}`, display: 'block' }}
                            />
                            <button
                              onClick={() => removePhoto(idx, pIdx)}
                              style={{
                                position: 'absolute', top: 2, right: 2,
                                background: 'rgba(0,0,0,0.65)', border: 'none',
                                color: '#f5f5f5', fontSize: 13, width: 22, height: 22,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '50%', lineHeight: 1,
                              }}
                            >×</button>
                          </div>
                          <button
                            onClick={() => setCaptionModal({ stepIdx: idx, photoIdx: pIdx, value: photo.caption })}
                            style={{
                              marginTop: 4, width: 80, padding: '4px 0', textAlign: 'center',
                              fontFamily: FONT_UI, fontSize: 11, color: photo.caption ? DARK : ACCENT,
                              background: 'none', border: `1px dashed ${photo.caption ? FAINT : ACCENT}`,
                              cursor: 'pointer', borderRadius: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >{photo.caption || '+ caption'}</button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={el => { fileInputRefs.current[idx] = el }}
                  style={{ display: 'none' }}
                  onChange={e => e.target.files && addPhotosToStep(idx, e.target.files)}
                />
                <button
                  onClick={() => fileInputRefs.current[idx]?.click()}
                  style={{
                    fontFamily: FONT_UI, fontSize: 12, fontWeight: 600,
                    color: ACCENT, background: 'none', border: `1px dashed ${ACCENT}`,
                    padding: '7px 14px', cursor: 'pointer', borderRadius: 0,
                    minHeight: 34,
                  }}
                >+ Add Photos</button>
              </div>
            </div>
          ))}

          <button
            onClick={addStep}
            style={{
              width: '100%', height: 48, background: 'none',
              border: `1.5px dashed ${FAINT}`, cursor: 'pointer',
              fontFamily: FONT_UI, fontSize: 13, fontWeight: 600,
              color: MID, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              borderRadius: 0,
            }}
          >+ Add Step</button>
        </div>

        {/* Timeline toggle */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 600, color: DARK, margin: 0 }}>Add to Timeline</p>
            <p style={{ fontFamily: FONT_UI, fontSize: 12, color: MID, margin: '2px 0 0' }}>
              {timelineAdded ? 'Already logged on your Timeline' : 'Log this guide as a Timeline note'}
            </p>
          </div>
          {timelineAdded
            ? <span style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 700, color: MID, letterSpacing: '0.06em' }}>✓ ADDED</span>
            : <Toggle value={addTimeline} onChange={setAddTimeline} />
          }
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: '100%', height: 52,
            background: saving ? 'rgba(28,28,26,0.3)' : DARK,
            border: `2px solid ${saving ? FAINT : ACCENT}`,
            color: '#f5f5f5', fontFamily: FONT_UI, fontSize: 14, fontWeight: 800,
            letterSpacing: '0.14em', cursor: saving ? 'default' : 'pointer',
            borderRadius: RADIUS_BUTTON, marginTop: 8,
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'SAVING…' : 'SAVE GUIDE'}
        </button>
      </div>

      {captionModal && (
        <CaptionModal
          target={captionModal}
          onSave={updatePhotoCaption}
          onClose={() => setCaptionModal(null)}
        />
      )}

      {saving && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(28,28,26,0.55)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.25)', borderTopColor: ACCENT,
            animation: 'diy-spin 0.8s linear infinite',
          }} />
          <span style={{ fontFamily: FONT_UI, fontSize: 14, fontWeight: 600, color: '#f5f5f5', letterSpacing: '0.04em' }}>{saveMsg}</span>
          <style>{`@keyframes diy-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  )
}
