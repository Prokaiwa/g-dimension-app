// Route: /tuning/mods/:modId/diy — Owner view of a DIY guide
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getYouTubeId } from '../lib/links'
import { FONT_UI, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'

// ── DIY aesthetic ─────────────────────────────────────────────────────────────
const BG     = '#f0efec'
const CARD   = '#ffffff'
const BORDER = 'rgba(0,0,0,0.07)'
const DARK   = '#1c1c1a'
const MID    = 'rgba(28,28,26,0.5)'
const FAINT  = 'rgba(28,28,26,0.18)'
const ACCENT = COLOR_ACCENT

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

function difficultyLabel(d: number | null): string {
  if (d === null) return 'Not set'
  if (d <= 1.5) return 'Beginner'
  if (d <= 2.5) return 'Easy'
  if (d === 3.0) return 'Intermediate'
  if (d <= 4.0) return 'Hard'
  return 'Expert'
}

function StarDisplay({ value, size = 22 }: { value: number | null; size?: number }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const fill   = Math.min(1, Math.max(0, value - (n - 1)))
        const fillPct = fill === 0 ? 0 : fill >= 1 ? 100 : 50
        const uid = `star-view-${n}`
        return (
          <div key={n} style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
              <path d={STAR_PATH} fill={FAINT} stroke="none" />
            </svg>
            {fillPct > 0 && (
              <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute', top: 0, left: 0 }}>
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
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Guide = {
  id: string; difficulty: number | null; estimated_time: string | null
  youtube_url: string | null; tools: string[]
}
type Step  = { id: string; step_order: number; title: string | null; description: string | null }
type Photo = { id: string; step_id: string; photo_url: string; caption: string | null; display_order: number }


export default function TuningDiyPage() {
  const { modId } = useParams<{ modId: string }>()
  const navigate  = useNavigate()

  const [modTitle, setModTitle] = useState<string>('')
  const [guide,    setGuide]    = useState<Guide | null>(null)
  const [steps,    setSteps]    = useState<Step[]>([])
  const [photos,   setPhotos]   = useState<Photo[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    if (!modId) return
    async function load() {
      const [{ data: job }, { data: g }] = await Promise.all([
        supabase.from('jobs').select('title').eq('id', modId).single(),
        supabase.from('diy_guides').select('id,difficulty,estimated_time,youtube_url,tools').eq('job_id', modId).maybeSingle(),
      ])
      if (job) setModTitle((job as { title: string }).title)
      if (g) {
        setGuide(g as Guide)
        const [{ data: st }, { data: ph }] = await Promise.all([
          supabase.from('diy_steps').select('id,step_order,title,description').eq('guide_id', g.id).order('step_order'),
          supabase.from('diy_step_photos').select('id,step_id,photo_url,caption,display_order').eq('guide_id' as never, g.id as never).order('display_order'),
        ])
        // diy_step_photos doesn't have guide_id, fetch via step_ids
        const stData = (st ?? []) as Step[]
        setSteps(stData)
        if (stData.length > 0) {
          const ids = stData.map(s => s.id)
          const { data: photos2 } = await supabase.from('diy_step_photos').select('id,step_id,photo_url,caption,display_order').in('step_id', ids).order('display_order')
          setPhotos((photos2 ?? []) as Photo[])
        }
        void ph
      }
      setLoading(false)
    }
    load()
  }, [modId])

  if (loading) return (
    <div style={{ background: BG, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: FONT_UI, fontSize: 13, color: MID }}>Loading…</span>
    </div>
  )

  if (!guide) return (
    <div style={{ background: BG, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', paddingLeft: 4 }}>
        <button onClick={() => navigate(`/tuning/mods/${modId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <p style={{ fontFamily: FONT_UI, fontSize: 15, color: MID, textAlign: 'center' }}>No guide yet.</p>
        <button onClick={() => navigate(`/tuning/mods/${modId}/diy/edit`)} style={{ padding: '13px 28px', background: 'rgba(200,102,26,0.1)', border: '1.5px solid rgba(200,102,26,0.45)', cursor: 'pointer', borderRadius: 10, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', color: ACCENT }}>
          CREATE GUIDE
        </button>
      </div>
    </div>
  )

  const ytId = guide.youtube_url ? getYouTubeId(guide.youtube_url) : null

  return (
    <div style={{ background: BG, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: HEADER_HEIGHT, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 16, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/tuning/mods/${modId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent', minHeight: 44 }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', color: 'rgba(245,240,228,0.5)' }}>Mod</span>
        </button>
        <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.12em', color: 'rgba(245,240,228,0.55)' }}>DIY GUIDE</span>
        <button onClick={() => navigate(`/tuning/mods/${modId}/diy/edit`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 4px 12px', WebkitTapHighlightColor: 'transparent', minHeight: 44 }}>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 12, letterSpacing: '0.1em', color: ACCENT }}>EDIT</span>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48 }}>

        {/* Mod title + G-DIMENSION badge */}
        <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 9, letterSpacing: '0.2em', color: ACCENT }}>G-DIMENSION</span>
            <span style={{ fontFamily: FONT_UI, fontSize: 9, letterSpacing: '0.18em', color: MID }}>DIY</span>
          </div>
          <p style={{ fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 700, fontSize: 26, color: DARK, margin: 0, lineHeight: 1.1 }}>{modTitle}</p>
        </div>

        {/* Meta: difficulty + time */}
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}` }}>
          {guide.difficulty != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StarDisplay value={guide.difficulty} size={20} />
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, color: DARK }}>{difficultyLabel(guide.difficulty)}</span>
            </div>
          )}
          {guide.estimated_time && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(28,28,26,0.06)', padding: '4px 10px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={MID} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style={{ fontFamily: FONT_UI, fontSize: 12, color: MID }}>{guide.estimated_time}</span>
            </div>
          )}
        </div>

        {/* YouTube embed */}
        {ytId && (
          <div style={{ padding: '20px 20px 0' }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: MID, marginBottom: 10 }}>Tutorial Video</p>
            <div style={{ width: '100%', aspectRatio: '16/9', background: DARK, overflow: 'hidden' }}>
              <iframe
                src={`https://www.youtube.com/embed/${ytId}`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Tutorial video"
              />
            </div>
          </div>
        )}

        {/* Tools */}
        {guide.tools.length > 0 && (
          <div style={{ padding: '20px 20px 0' }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: MID, marginBottom: 10 }}>Tools Needed</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {guide.tools.map((tool, i) => (
                <span key={i} style={{ fontFamily: FONT_UI, fontSize: 12, fontWeight: 600, color: DARK, background: 'rgba(28,28,26,0.07)', padding: '5px 10px' }}>
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <div style={{ padding: '24px 20px 0' }}>
            <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: MID, marginBottom: 14 }}>Steps</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {steps.map((step, idx) => {
                const stepPhotos = photos.filter(p => p.step_id === step.id).sort((a, b) => a.display_order - b.display_order)
                return (
                  <div key={step.id} style={{ background: CARD, border: `1px solid ${BORDER}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    {/* Step header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: stepPhotos.length > 0 || step.description ? `1px solid ${BORDER}` : 'none' }}>
                      <div style={{ width: 28, height: 28, background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontWeight: 700, fontSize: 11, color: '#f0efec' }}>{idx + 1}</span>
                      </div>
                      <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 15, color: DARK, margin: 0, flex: 1 }}>
                        {step.title || `Step ${idx + 1}`}
                      </p>
                    </div>
                    {/* Description */}
                    {step.description && (
                      <p style={{ fontFamily: FONT_UI, fontSize: 14, color: MID, lineHeight: 1.6, margin: 0, padding: '12px 16px', borderBottom: stepPhotos.length > 0 ? `1px solid ${BORDER}` : 'none' }}>
                        {step.description}
                      </p>
                    )}
                    {/* Photos */}
                    {stepPhotos.length > 0 && (
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: stepPhotos.length === 1 ? '1fr' : 'repeat(2, 1fr)', gap: 8 }}>
                          {stepPhotos.map(ph => (
                            <div key={ph.id}>
                              <img src={ph.photo_url} alt={ph.caption ?? ''} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                              {ph.caption && (
                                <p style={{ fontFamily: FONT_UI, fontSize: 11, color: MID, margin: '4px 0 0', lineHeight: 1.4 }}>{ph.caption}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Edit guide CTA */}
        <div style={{ padding: '28px 20px 0' }}>
          <button
            onClick={() => navigate(`/tuning/mods/${modId}/diy/edit`)}
            style={{ width: '100%', padding: '15px', background: 'rgba(200,102,26,0.08)', border: '1.5px solid rgba(200,102,26,0.35)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.12em', color: ACCENT }}
          >
            EDIT GUIDE
          </button>
        </div>

      </div>
    </div>
  )
}
