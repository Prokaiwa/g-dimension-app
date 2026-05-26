const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_TIMELINE_SERVICE, COLOR_TIMELINE_DETAIL,
  FONT_UI, HEADER_HEIGHT,
} from '../tokens'

type DetailSession = {
  id: string
  date_performed: string
  time_taken: string | null
  total_cost: number | null
}

export default function MaintenanceDetailPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<DetailSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getActiveCarId().then(carId => {
      if (!carId) { setLoading(false); return }
      supabase
        .from('sessions')
        .select('id, date_performed, time_taken, total_cost')
        .eq('car_id', carId)
        .eq('type', 'detail')
        .order('date_performed', { ascending: false })
        .then(({ data }) => {
          if (data) setSessions(data as DetailSession[])
          setLoading(false)
        })
    })
  }, [])

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number)
    return `${MONTHS[m - 1]} ${day}, ${y}`
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#0a0908', fontFamily: FONT_UI, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 10 }}>
        <button onClick={() => navigate('/maintenance')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Maintenance</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_TIMELINE_SERVICE, color: '#0d0d0d', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!loading && sessions.map(s => (
          <button key={s.id} onClick={() => navigate(`/maintenance/${s.id}`)} style={{
            width: '100%', display: 'flex', alignItems: 'center',
            background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
            padding: '14px 16px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,245,245,0.85)' }}>{fmtDate(s.date_performed)}</div>
              {s.time_taken && <div style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(245,245,245,0.40)', marginTop: 2 }}>{s.time_taken}</div>}
            </div>
            {s.total_cost != null && <span style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 13, color: COLOR_TIMELINE_DETAIL, paddingRight: 10 }}>${Number(s.total_cost).toFixed(2)}</span>}
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>›</span>
          </button>
        ))}
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => navigate('/maintenance/detail/new')}
        style={{
          position: 'fixed', right: 20, bottom: 28,
          width: 52, height: 52,
          background: COLOR_TIMELINE_SERVICE, border: 'none', borderRadius: '50%',
          color: '#0a0a0a', fontSize: 28, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >+</button>
    </div>
  )
}
