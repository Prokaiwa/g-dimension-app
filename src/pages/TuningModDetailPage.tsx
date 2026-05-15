// Route: /tuning/mods/:modId — Mod detail with section photo setter
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { FONT_UI, FONT_TITLE, COLOR_ACCENT, COLOR_HEADER_BLACK, COLOR_HEADER_WARM, HEADER_HEIGHT } from '../tokens'

// ── Types ─────────────────────────────────────────────────────────────────

type Job = {
  id: string
  title: string
  brand: string | null
  category: string | null
  date_installed: string | null
  installed_by: 'self' | 'shop' | null
  parts_cost: number | null
  labor_cost: number | null
  notes: string | null
  part_type_id: number | null
}

type Photo = { id: string; photo_url: string; display_order: number | null }

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_TO_GROUP: Record<string, string> = {
  'Engine': 'power', 'Drivetrain': 'power', 'Forced Induction': 'power',
  'Exhaust': 'power', 'Cooling': 'power', 'Fuel System': 'power', 'Electrical': 'power',
  'Suspension': 'chassis', 'Brakes': 'chassis', 'Wheels & Tires': 'chassis',
  'Exterior': 'exterior', 'Paint & Wrap': 'exterior', 'Lighting': 'exterior',
  'Interior': 'interior', 'Audio': 'interior', 'Safety': 'interior',
}

const GROUP_LABEL: Record<string, string> = {
  power: 'Power', chassis: 'Chassis', exterior: 'Exterior', interior: 'Interior',
}

const GROUP_PHOTO_COL: Record<string, string> = {
  power:    'build_sheet_power_photo',
  chassis:  'build_sheet_chassis_photo',
  exterior: 'build_sheet_exterior_photo',
  interior: 'build_sheet_interior_photo',
}

const LABEL: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 9,
  letterSpacing: '0.14em', textTransform: 'uppercase',
  color: 'rgba(245,240,228,0.3)',
}

const VALUE: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 600, fontSize: 14,
  color: 'rgba(245,240,228,0.82)',
  marginTop: 3,
}

// ── Component ──────────────────────────────────────────────────────────────

import React from 'react'

export default function TuningModDetailPage() {
  const { modId } = useParams<{ modId: string }>()
  const navigate  = useNavigate()

  const [job,          setJob]          = useState<Job | null>(null)
  const [partTypeName, setPartTypeName] = useState<string | null>(null)
  const [photos,       setPhotos]       = useState<Photo[]>([])
  const [loading,      setLoading]      = useState(true)
  const [setSuccess,   setSetSuccess]   = useState<string | null>(null)

  useEffect(() => {
    if (!modId) return
    async function load() {
      const [{ data: jobData }, { data: photoData }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, brand, category, date_installed, installed_by, parts_cost, labor_cost, notes, part_type_id')
          .eq('id', modId)
          .single(),
        supabase
          .from('job_photos')
          .select('id, photo_url, display_order')
          .eq('job_id', modId)
          .order('display_order', { ascending: true }),
      ])
      if (jobData) {
        setJob(jobData as unknown as Job)
        if ((jobData as unknown as Job).part_type_id) {
          const { data: ptData } = await supabase
            .from('part_types')
            .select('name')
            .eq('id', (jobData as unknown as Job).part_type_id)
            .single()
          if (ptData) setPartTypeName((ptData as { name: string }).name)
        }
      }
      setPhotos((photoData ?? []) as Photo[])
      setLoading(false)
    }
    load()
  }, [modId])

  const handleSetSectionPhoto = async (photoUrl: string) => {
    if (!job?.category) return
    const group = CATEGORY_TO_GROUP[job.category]
    const col   = GROUP_PHOTO_COL[group]
    if (!col) return
    const carId = await getActiveCarId()
    if (!carId) return
    await supabase.from('cars').update({ [col]: photoUrl }).eq('id', carId)
    setSetSuccess(GROUP_LABEL[group])
    setTimeout(() => setSetSuccess(null), 2500)
  }

  const group      = job?.category ? CATEGORY_TO_GROUP[job.category] : null
  const groupLabel = group ? GROUP_LABEL[group] : null

  const formatDate = (d: string | null) => {
    if (!d) return null
    const [y, m, mo] = d.split('-').map(Number)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[(m ?? mo) - 1]} ${y}`
  }

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 11, color: 'rgba(245,240,228,0.2)', letterSpacing: '0.12em' }}>LOADING</span>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <span style={{ fontFamily: FONT_UI, fontSize: 13, color: 'rgba(245,240,228,0.35)' }}>Mod not found</span>
        <button onClick={() => navigate('/tuning/build-sheet')} style={{ background: 'none', border: '1px solid rgba(245,240,228,0.14)', padding: '10px 24px', cursor: 'pointer', fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
          ← Build Sheet
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', background: '#0d0d0f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        height: HEADER_HEIGHT, flexShrink: 0,
        background: COLOR_HEADER_BLACK,
        display: 'flex', alignItems: 'center',
        paddingLeft: 4, paddingRight: 16,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <button
          onClick={() => navigate('/tuning/build-sheet')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px 4px 8px', WebkitTapHighlightColor: 'transparent' }}
        >
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.4)' }}>
            Build Sheet
          </span>
        </button>
        <button
          onClick={() => navigate(`/tuning/mods/${modId}/edit`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', WebkitTapHighlightColor: 'transparent', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_ACCENT }}
        >
          Edit
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 48 }}>

        {/* Title block */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, letterSpacing: '-0.01em', lineHeight: 1.1, color: 'rgba(245,240,228,0.95)', margin: 0 }}>
            {job.title}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {partTypeName && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(245,240,228,0.35)', border: '1px solid rgba(245,240,228,0.1)', padding: '3px 7px' }}>
                {partTypeName}
              </span>
            )}
            {job.category && (
              <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(200,102,26,0.7)', border: '1px solid rgba(200,102,26,0.2)', padding: '3px 7px' }}>
                {job.category}
              </span>
            )}
          </div>
        </div>

        {/* Details */}
        <div style={{ padding: '20px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 16px' }}>
          {job.brand && (
            <div>
              <p style={LABEL}>Brand</p>
              <p style={VALUE}>{job.brand}</p>
            </div>
          )}
          {job.date_installed && (
            <div>
              <p style={LABEL}>Installed</p>
              <p style={VALUE}>{formatDate(job.date_installed)}</p>
            </div>
          )}
          {job.installed_by && (
            <div>
              <p style={LABEL}>Installed By</p>
              <p style={VALUE}>{job.installed_by === 'self' ? 'Self' : 'Shop'}</p>
            </div>
          )}
          {job.parts_cost != null && (
            <div>
              <p style={LABEL}>Parts Cost</p>
              <p style={VALUE}>${job.parts_cost.toLocaleString()}</p>
            </div>
          )}
          {job.labor_cost != null && (
            <div>
              <p style={LABEL}>Labor Cost</p>
              <p style={VALUE}>${job.labor_cost.toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {job.notes && (
          <div style={{ padding: '20px 20px 0' }}>
            <p style={LABEL}>Notes</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 14, color: 'rgba(245,240,228,0.65)', lineHeight: 1.6, marginTop: 6 }}>
              {job.notes}
            </p>
          </div>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div style={{ padding: '24px 20px 0' }}>
            <p style={{ ...LABEL, marginBottom: 12 }}>Photos</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {photos.map(photo => (
                <div key={photo.id} style={{ position: 'relative' }}>
                  <img
                    src={photo.photo_url}
                    alt=""
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                  />
                  {groupLabel && (
                    <button
                      onClick={() => handleSetSectionPhoto(photo.photo_url)}
                      style={{
                        position: 'absolute', bottom: 6, right: 6,
                        background: 'rgba(0,0,0,0.75)',
                        border: '1px solid rgba(245,240,228,0.18)',
                        padding: '5px 8px',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                        fontFamily: FONT_UI, fontWeight: 800, fontSize: 8,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        color: 'rgba(245,240,228,0.6)',
                      }}
                    >
                      Set {groupLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Success toast ── */}
      {setSuccess && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,30,32,0.96)', border: '1px solid rgba(200,102,26,0.4)',
          padding: '10px 20px',
          fontFamily: FONT_UI, fontWeight: 700, fontSize: 11,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: COLOR_ACCENT, whiteSpace: 'nowrap',
          zIndex: 50,
        }}>
          ✓ Set as {setSuccess} Photo
        </div>
      )}

    </div>
  )
}
