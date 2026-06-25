// Route: /garage/pdf — Build Report: Carfax-style downloadable build sheet (Part 10, Part 15)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { getCarPrivate } from '../lib/carPrivate'
import { playBack } from '../lib/sound'
import { generateBuildPdf, pdfFilename, type PdfData, type PdfMod, type PdfService } from '../lib/buildPdf'
import gLogoAsset from '../assets/logo/gdimensionG.webp'
import {
  COLOR_HEADER_BLACK, COLOR_HEADER_WARM, COLOR_HEADER_TITLE,
  COLOR_BURGUNDY_M, COLOR_ACCENT, FONT_UI, FONT_TITLE, HEADER_HEIGHT,
  RADIUS_BUTTON,
} from '../tokens'

const _now        = new Date()
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL   = String(_now.getDate())

const BG         = '#e8e8e6'
const CARD_BG    = '#f4f4f2'
const TEXT       = '#1a1a1c'
const TEXT_MUTED = 'rgba(26,26,28,0.45)'
const BORDER     = 'rgba(0,0,0,0.07)'

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'7px 0', borderBottom:`1px solid ${BORDER}` }}>
      <span style={{ fontFamily:FONT_UI, fontSize:13, color:TEXT_MUTED }}>{label}</span>
      <span style={{ fontFamily:FONT_UI, fontWeight:700, fontSize:13, color: accent ? COLOR_ACCENT : TEXT, textAlign:'right', marginLeft:12 }}>{value}</span>
    </div>
  )
}

export default function GaragePdfPage() {
  const navigate = useNavigate()
  const [loading, setLoading]         = useState(true)
  const [pdfData, setPdfData]         = useState<PdfData | null>(null)
  const [includePricing, setInclude]  = useState(false)
  const [busy, setBusy]               = useState(false)
  const [err, setErr]                 = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare

  useEffect(() => {
    async function load() {
      const carId = await getActiveCarId()
      if (!carId) { setLoading(false); return }

      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id

      const [carRes, modsRes, , svcRes, ownerRes] = await Promise.all([
        supabase
          .from('cars')
          .select('id,year,make,model,variant,current_mileage,horsepower,torque,weight_lbs,garage_photo_url,original_photo_url')
          .eq('id', carId).single(),
        supabase
          .from('jobs')
          .select('id,title,brand,category,date_installed,install_mileage,installed_by,parts_cost,labor_cost,session_id,status,type')
          .eq('car_id', carId).eq('status','installed').eq('type','modification')
          .order('date_installed', { ascending: false, nullsFirst: false }),
        supabase
          .from('sessions')
          .select('id')
          .eq('car_id', carId).eq('type','modification').not('title','is',null),
        supabase
          .from('sessions')
          .select('id,type,date_performed,performed_by,shop_name,mileage,total_cost,labor_cost,tax_amount,notes,title,jobs(id,title,cost)')
          .eq('car_id', carId)
          .in('type', ['maintenance','detail'])
          .order('date_performed', { ascending: false, nullsFirst: false }),
        uid
          ? supabase.from('users').select('display_name,username').eq('id', uid).single()
          : Promise.resolve({ data: null }),
      ])

      const car = carRes.data
      if (!car) { setLoading(false); return }
      // VIN lives in car_private (migration 061) — owner-only.
      const priv = await getCarPrivate(carId)

      type JobRow = { id:string; title:string; brand:string|null; category:string|null; date_installed:string|null; install_mileage:number|null; installed_by:'self'|'shop'|null; parts_cost:number|null; labor_cost:number|null; session_id:string|null }
      type SvcRow = { id:string; type:string; date_performed:string; performed_by:'self'|'shop'|null; shop_name:string|null; mileage:number|null; total_cost:number|null; labor_cost:number|null; tax_amount:number|null; notes:string|null; title:string|null; jobs:{id:string;title:string;cost:number|null}[] }

      const jobs = (modsRes.data ?? []) as unknown as JobRow[]
      const svcs = (svcRes.data ?? []) as unknown as SvcRow[]

      const mods: PdfMod[] = jobs.map(j => ({
        title: j.title,
        brand: j.brand,
        category: j.category,
        date_installed: j.date_installed,
        install_mileage: j.install_mileage,
        installed_by: j.installed_by,
        parts_cost: j.parts_cost,
        labor_cost: j.labor_cost,
      }))

      const services: PdfService[] = svcs.map(s => ({
        type: s.type,
        date_performed: s.date_performed,
        mileage: s.mileage,
        performed_by: s.performed_by,
        shop_name: s.shop_name,
        title: s.title,
        jobs: (s.jobs ?? []).map(j => ({ title: j.title, cost: j.cost })),
        total_cost: s.total_cost,
        labor_cost: s.labor_cost,
        tax_amount: s.tax_amount,
        notes: s.notes,
      }))

      const investment = jobs.reduce((sum, j) => sum + (j.parts_cost ?? 0) + (j.labor_cost ?? 0), 0)
      const owner = ownerRes.data as { display_name:string|null; username:string|null } | null

      // Resolve the Vite asset URL to an absolute URL fetchable by the PDF generator.
      const logoUrl = new URL(gLogoAsset, window.location.origin).href

      setPdfData({
        car: { ...car, vin: priv.vin } as unknown as PdfData['car'],
        ownerName: owner?.display_name ?? null,
        ownerHandle: owner?.username ?? null,
        mods,
        services,
        investment: investment > 0 ? investment : null,
        gLogoUrl: logoUrl,
        includePricing: false, // overridden just before generate
      })
      setLoading(false)
    }
    load()
  }, [])

  const carTitle = pdfData ? ([pdfData.car.year, pdfData.car.model, pdfData.car.variant].filter(Boolean).join(' ') || 'Build') : ''
  const modCount = pdfData?.mods.length ?? 0
  const svcCount = pdfData?.services.length ?? 0

  async function generate(share: boolean) {
    if (!pdfData || busy) return
    setBusy(true); setErr(null); setDone(false)
    try {
      const doc = await generateBuildPdf({ ...pdfData, includePricing })
      const name = pdfFilename(pdfData.car)
      if (share && canShare) {
        const blob = doc.output('blob')
        const file = new File([blob], name, { type:'application/pdf' })
        if (navigator.canShare({ files:[file] })) {
          await navigator.share({ files:[file], title:`${carTitle} — Build Report` })
          setBusy(false); return
        }
      }
      doc.save(name)
      setDone(true)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setErr('Could not generate the PDF. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:BG, fontFamily:FONT_UI, overflow:'hidden' }}>

      {/* ── Header ── */}
      <div style={{ position:'relative', height:HEADER_HEIGHT, background:COLOR_HEADER_BLACK, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:10, paddingRight:14, flexShrink:0, zIndex:10, borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button onClick={() => { playBack(); navigate('/garage') }} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px 8px 4px 4px', display:'flex', alignItems:'center' }}>
            <span style={{ color:COLOR_HEADER_WARM, fontSize:22, fontWeight:300, lineHeight:1 }}>‹</span>
          </button>
          <span style={{ fontFamily:FONT_TITLE, fontStyle:'italic', fontWeight:600, fontSize:22, color:COLOR_HEADER_TITLE, letterSpacing:'0.01em' }}>Build Report</span>
        </div>
        <div style={{ display:'flex', alignItems:'stretch', gap:0 }}>
          {pdfData && (
            <span style={{ fontFamily:FONT_UI, fontWeight:700, fontSize:11, color:COLOR_HEADER_WARM, letterSpacing:'0.04em', opacity:0.75, display:'flex', alignItems:'center', paddingRight:10 }}>
              {carTitle}
            </span>
          )}
          <div style={{ background:'rgba(242,238,228,0.94)', color:'#0d0d0d', padding:'4px 7px', fontFamily:FONT_UI, fontWeight:800, fontSize:11, letterSpacing:'0.05em', textTransform:'uppercase', display:'flex', alignItems:'center' }}>{MONTH_LABEL}</div>
          <div style={{ background:COLOR_BURGUNDY_M, color:'#fff', padding:'4px 8px', fontFamily:FONT_UI, fontWeight:800, fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 16px 48px' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50%' }}>
            <span style={{ fontSize:12, color:TEXT_MUTED, letterSpacing:'0.1em', textTransform:'uppercase' }}>Loading…</span>
          </div>
        ) : !pdfData ? (
          <div style={{ textAlign:'center', paddingTop:60 }}>
            <p style={{ fontSize:14, color:TEXT_MUTED }}>No active car. Add a car first.</p>
          </div>
        ) : (
          <>
            {/* Intro */}
            <p style={{ fontFamily:FONT_TITLE, fontStyle:'italic', fontSize:24, color:TEXT, margin:'0 0 6px', lineHeight:1.15 }}>
              Your build, on record.
            </p>
            <p style={{ fontSize:13, color:TEXT_MUTED, lineHeight:1.55, margin:'0 0 22px' }}>
              The full record. Print it, share it, hand it to a buyer — vehicle identity, modification history, and service history in one document.
            </p>

            {/* Contents card */}
            <div style={{ background:CARD_BG, border:`1px solid ${BORDER}`, padding:'14px 16px', marginBottom:20 }}>
              <div style={{ fontFamily:FONT_UI, fontWeight:700, fontSize:9, letterSpacing:'0.14em', textTransform:'uppercase', color:TEXT_MUTED, marginBottom:10 }}>What's included</div>
              <Row label="Vehicle"             value={carTitle} />
              <Row label="Modifications"       value={`${modCount} entr${modCount !== 1 ? 'ies' : 'y'}`} />
              <Row label="Service records"     value={`${svcCount} record${svcCount !== 1 ? 's' : ''}`} />
              {pdfData.investment != null && (
                <Row label="Build investment" value={'$' + Math.round(pdfData.investment).toLocaleString('en-US')} accent />
              )}
            </div>

            {/* Pricing toggle */}
            <button
              onClick={() => setInclude(v => !v)}
              style={{
                width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'13px 16px', background:CARD_BG, border:`1px solid ${includePricing ? COLOR_ACCENT : BORDER}`,
                borderRadius:RADIUS_BUTTON, cursor:'pointer', marginBottom:20,
                WebkitTapHighlightColor:'transparent',
                transition:'border-color 180ms ease',
              }}
            >
              <div style={{ textAlign:'left' }}>
                <div style={{ fontFamily:FONT_UI, fontWeight:700, fontSize:14, color:TEXT }}>Include pricing</div>
                <div style={{ fontFamily:FONT_UI, fontSize:12, color:TEXT_MUTED, marginTop:2 }}>
                  Adds mod costs, service costs, and build investment total
                </div>
              </div>
              {/* Toggle pill */}
              <div style={{
                width:44, height:26, borderRadius:13, flexShrink:0, marginLeft:14,
                background: includePricing ? COLOR_ACCENT : 'rgba(0,0,0,0.15)',
                position:'relative', transition:'background 180ms ease',
              }}>
                <div style={{
                  position:'absolute', top:3, left: includePricing ? 21 : 3,
                  width:20, height:20, borderRadius:'50%', background:'#fff',
                  boxShadow:'0 1px 4px rgba(0,0,0,0.25)',
                  transition:'left 180ms ease',
                }} />
              </div>
            </button>

            {err && <p style={{ fontSize:12, color:COLOR_BURGUNDY_M, marginBottom:14 }}>{err}</p>}
            {done && !err && (
              <p style={{ fontFamily:FONT_UI, fontSize:12, color:COLOR_ACCENT, marginBottom:14 }}>
                Saved to your downloads.
              </p>
            )}

            {/* Actions */}
            <button
              onClick={() => generate(false)}
              disabled={busy}
              style={{
                width:'100%', padding:'15px 0', borderRadius:RADIUS_BUTTON, border:'none',
                background: busy ? `rgba(200,102,26,0.5)` : COLOR_ACCENT,
                color:'#fff5dc', fontFamily:FONT_UI, fontWeight:800, fontSize:13, letterSpacing:'0.04em',
                cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor:'transparent',
              }}
            >
              {busy ? 'Generating…' : 'Download PDF'}
            </button>

            {canShare && (
              <button
                onClick={() => generate(true)}
                disabled={busy}
                style={{
                  width:'100%', padding:'14px 0', marginTop:10, borderRadius:RADIUS_BUTTON,
                  background:'transparent', border:`1px solid ${COLOR_ACCENT}`, color:COLOR_ACCENT,
                  fontFamily:FONT_UI, fontWeight:800, fontSize:13, letterSpacing:'0.04em',
                  cursor: busy ? 'default' : 'pointer', WebkitTapHighlightColor:'transparent',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                Share PDF
              </button>
            )}

            {/* Footnote */}
            <p style={{ fontFamily:FONT_UI, fontSize:11, color:TEXT_MUTED, lineHeight:1.5, marginTop:22, textAlign:'center' }}>
              Generated on-device · {new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
