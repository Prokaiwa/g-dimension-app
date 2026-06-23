// Route: /builds/:username/mods/:modId/diy — Public read-only DIY guide
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getYouTubeId } from '../lib/links'
import ImageLightbox from '../components/ImageLightbox'
import { FONT_UI, COLOR_ACCENT } from '../tokens'

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
        const fill    = Math.min(1, Math.max(0, value - (n - 1)))
        const fillPct = fill === 0 ? 0 : fill >= 1 ? 100 : 50
        const uid = `star-pub-${n}`
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

type Guide = {
  id: string; difficulty: number | null; estimated_time: string | null
  youtube_url: string | null; tools: string[]
}
type Step  = { id: string; step_order: number; title: string | null; description: string | null }
type Photo = { id: string; step_id: string; photo_url: string; caption: string | null; display_order: number }

export default function PublicDiyPage() {
  const { username, modId } = useParams<{ username: string; modId: string }>()
  const navigate = useNavigate()

  const [modTitle,  setModTitle]  = useState<string>('')
  const [carName,   setCarName]   = useState<string>('')
  const [guide,     setGuide]     = useState<Guide | null>(null)
  const [steps,     setSteps]     = useState<Step[]>([])
  const [photos,    setPhotos]    = useState<Photo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [lightbox,  setLightbox]  = useState<{ src: string; caption: string | null } | null>(null)

  useEffect(() => {
    if (!username || !modId) return
    async function load() {
      // Guide first — RLS only returns it when the car is public AND its Build
      // Sheet is public (migration 059). This is the real visibility gate, and
      // it sidesteps the multi-car ambiguity of looking a car up by username.
      const { data: g } = await supabase
        .from('diy_guides')
        .select('id, car_id, difficulty, estimated_time, youtube_url, tools')
        .eq('job_id', modId)
        .maybeSingle()

      if (!g) { setNotFound(true); setLoading(false); return }
      setGuide(g)

      // Mod title (jobs uses `title`, not `name`)
      const { data: job } = await supabase
        .from('jobs')
        .select('title, brand')
        .eq('id', modId)
        .maybeSingle()

      if (job) setModTitle([job.brand, (job as { title?: string }).title].filter(Boolean).join(' '))

      // Car identity — resolve from the guide's car_id (user may have many cars)
      const carId = (g as { car_id?: string }).car_id
      if (carId) {
        const { data: car } = await supabase
          .from('public_car_profiles')
          .select('year, make, model, variant')
          .eq('id', carId)
          .maybeSingle()
        if (car) {
          const variant = (car as { variant?: string }).variant
          setCarName([car.year, car.make, car.model, variant].filter(Boolean).join(' '))
        }
      }

      // Steps
      const { data: ss } = await supabase
        .from('diy_steps')
        .select('id, step_order, title, description')
        .eq('guide_id', g.id)
        .order('step_order')
      setSteps(ss ?? [])

      // Photos
      if (ss && ss.length > 0) {
        const stepIds = ss.map((s: Step) => s.id)
        const { data: ps } = await supabase
          .from('diy_step_photos')
          .select('id, step_id, photo_url, caption, display_order')
          .in('step_id', stepIds)
          .order('display_order')
        setPhotos(ps ?? [])
      }

      setLoading(false)
    }
    load()
  }, [username, modId])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_UI }}>
        <div style={{ color: MID, fontSize: 14, letterSpacing: '0.08em' }}>LOADING</div>
      </div>
    )
  }

  if (notFound || !guide) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT_UI, gap: 12 }}>
        <div style={{ color: DARK, fontSize: 20, fontWeight: 700 }}>Guide not found</div>
        <div style={{ color: MID, fontSize: 14 }}>This guide may be private or doesn't exist.</div>
        <button
          onClick={() => navigate(`/builds/${username}`)}
          style={{ marginTop: 16, padding: '10px 24px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, cursor: 'pointer', letterSpacing: '0.05em' }}
        >
          VIEW BUILD
        </button>
      </div>
    )
  }

  const ytId = guide.youtube_url ? getYouTubeId(guide.youtube_url) : null
  const stepPhotos = (stepId: string) =>
    photos.filter(p => p.step_id === stepId).sort((a, b) => a.display_order - b.display_order)

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FONT_UI }}>

      {/* ── Masthead header ────────────────────────────────────────────────────── */}
      <div style={{ background: DARK, padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* G-Dimension wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_UI, fontWeight: 900, fontSize: 15, color: '#fff', letterSpacing: '-0.03em',
          }}>G</div>
          <span style={{ fontFamily: FONT_UI, fontWeight: 800, fontSize: 16, color: '#f5f5f5', letterSpacing: '0.12em' }}>
            G-DIMENSION
          </span>
        </div>
        <div style={{
          marginTop: 2,
          fontFamily: FONT_UI, fontWeight: 600, fontSize: 10, color: ACCENT,
          letterSpacing: '0.22em', textTransform: 'uppercase' as const,
        }}>
          BUILD GUIDE
        </div>
      </div>

      {/* ── Mod + car identity ─────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: DARK, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
          {modTitle || 'Install Guide'}
        </div>
        {carName && (
          <div style={{ marginTop: 4, fontSize: 13, color: MID, letterSpacing: '0.03em' }}>{carName}</div>
        )}
      </div>

      {/* ── Difficulty + time chips ─────────────────────────────────────────────── */}
      {(guide.difficulty || guide.estimated_time) && (
        <div style={{ padding: '14px 20px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
          {guide.difficulty && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px' }}>
              <StarDisplay value={guide.difficulty} size={18} />
              <span style={{ fontSize: 12, fontWeight: 600, color: DARK, letterSpacing: '0.06em' }}>
                {difficultyLabel(guide.difficulty).toUpperCase()}
              </span>
            </div>
          )}
          {guide.estimated_time && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: DARK, letterSpacing: '0.06em' }}>
              {guide.estimated_time}
            </div>
          )}
        </div>
      )}

      {/* ── YouTube embed ───────────────────────────────────────────────────────── */}
      {ytId && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 0, overflow: 'hidden', background: '#000' }}>
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              title="Install guide video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        </div>
      )}

      {/* ── Tools ───────────────────────────────────────────────────────────────── */}
      {guide.tools.length > 0 && (
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MID, letterSpacing: '0.14em', marginBottom: 10 }}>TOOLS NEEDED</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {guide.tools.map((t, i) => (
              <div key={i} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '6px 12px', fontSize: 13, fontWeight: 500, color: DARK,
              }}>{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Steps ───────────────────────────────────────────────────────────────── */}
      {steps.length > 0 && (
        <div style={{ padding: '24px 20px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MID, letterSpacing: '0.14em', marginBottom: 14 }}>
            STEPS · {steps.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {steps.map((step, idx) => {
              const sp = stepPhotos(step.id)
              return (
                <div key={step.id} style={{ background: CARD, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                  {/* Step header */}
                  <div style={{ padding: '14px 16px 12px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: DARK,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: '#f5f5f5',
                      flexShrink: 0,
                    }}>{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      {step.title && (
                        <div style={{ fontSize: 15, fontWeight: 700, color: DARK, lineHeight: 1.3 }}>{step.title}</div>
                      )}
                      {step.description && (
                        <div style={{ marginTop: step.title ? 6 : 0, fontSize: 14, color: DARK, lineHeight: 1.6, opacity: 0.85 }}>
                          {step.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Step photos — full-width, in order */}
                  {sp.length > 0 && (
                    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {sp.map(ph => (
                        <div key={ph.id}>
                          <img
                            src={ph.photo_url}
                            alt={ph.caption ?? ''}
                            onClick={() => setLightbox({ src: ph.photo_url, caption: ph.caption })}
                            style={{ width: '100%', display: 'block', cursor: 'zoom-in' }}
                          />
                          {ph.caption && (
                            <div style={{ marginTop: 6, fontSize: 12, color: MID, lineHeight: 1.5 }}>{ph.caption}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Footer brand + link ─────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderTop: `1px solid ${BORDER}`, marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: FONT_UI, fontWeight: 900, fontSize: 12, color: '#fff',
          }}>G</div>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: DARK, letterSpacing: '0.1em' }}>G-DIMENSION</span>
        </div>
        <a
          href="https://gdimension.app"
          style={{ fontSize: 12, color: MID, textDecoration: 'none', letterSpacing: '0.04em' }}
        >
          gdimension.app
        </a>
        {username && (
          <button
            onClick={() => navigate(`/builds/${username}`)}
            style={{
              marginTop: 8, padding: '10px 28px',
              background: ACCENT, color: '#fff', border: 'none', borderRadius: 10,
              fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            VIEW FULL BUILD
          </button>
        )}
      </div>

      {lightbox && (
        <ImageLightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
