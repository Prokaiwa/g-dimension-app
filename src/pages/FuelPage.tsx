// /fuel — the fuel record (ADR-033).
//
// Reached from the Fuel tile on the Maintenance hub. Capture does NOT live here:
// logging a fill-up is a ten-second job at a pump and happens in a sheet on Home,
// because a route means a chunk fetch and a session round-trip on the worst
// connection the app ever sees. This page is the browsing half, where a chart
// and a log are allowed to cost a moment.
//
// AESTHETIC. Maintenance's clothes for the place, a pump's own instrument for the
// numbers. Same S-curve cut and the same golden tint as MaintenancePage, then the
// field resolves to the app's near-black and every figure sits on an LCD
// (components/SevenSeg). An earlier pass ran the figures in amber on the amber
// hero, which was amber on amber; the LCD moves the colour story so that amber is
// the PLACE and grey-green is the INSTRUMENT.
//
// THE BLOCK THAT JUSTIFIES THE FEATURE is "What this car has cost you". Every
// competitor's fuel section is a silo: a table of purchases with an average on
// top. This app already knows the mods and the services, so it is the only one
// that can put fuel in the same frame. That is why the split sits above the log
// rather than at the bottom of a stats tab.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { asMileageUnit, milesToUnit, type MileageUnit } from '../lib/mileage'
import {
  summarise, galToUnit, asVolumeUnit, volumeLabel,
  type FuelEntry, type FuelSummary, type VolumeUnit,
} from '../lib/fuel'
import { SevenSeg, LcdPanel, lcdInk } from '../components/SevenSeg'
import ArrivalFade from '../components/ArrivalFade'
import fuelHero from '../assets/backgrounds/fuel_hero.webp'
import {
  COLOR_HEADER_WARM, COLOR_HEADER_TITLE, COLOR_HEADER_BLACK,
  COLOR_BURGUNDY_L, COLOR_BURGUNDY_M, COLOR_BURGUNDY_R,
  COLOR_ACCENT, COLOR_BRAND, FONT_UI, HEADER_HEIGHT,
} from '../tokens'

const FIELD = '#08090a'
const CREAM = 'rgba(240,228,200,'
/** COLOR_WORLD_LOW. Service's share of the split; the one neutral in the trio. */
const SERVICE_GREY = '#6a737a'

type Car = { year: number | null; model: string | null; variant: string | null; mileage_unit: string | null }

export default function FuelPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [car, setCar] = useState<Car | null>(null)
  const [mUnit, setMUnit] = useState<MileageUnit>('mi')
  const [vUnit, setVUnit] = useState<VolumeUnit>('gal_us')
  const [summary, setSummary] = useState<FuelSummary | null>(null)
  const [modSpend, setModSpend] = useState(0)
  const [serviceSpend, setServiceSpend] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!carId) { if (alive) setLoading(false); return }

      const [carRes, fuelRes, jobsRes, svcRes, meRes] = await Promise.all([
        supabase.from('cars').select('year, model, variant, mileage_unit').eq('id', carId).single(),
        // Guarded like every other post-migration read in this codebase: before
        // 097 is applied the table does not exist and this 404s, which must
        // degrade to an empty log rather than an error screen.
        supabase.from('fuel_entries')
          .select('id, filled_on, odometer, volume, total_cost, is_full, is_missed')
          .eq('car_id', carId).order('odometer', { ascending: true }),
        // status='installed' as well as type='modification', matching
        // GaragePdfPage's `investment` exactly. Without the status filter this
        // would also count Parts Bin stock and wishlist items, and the same car
        // would report two different mod totals depending on which screen you
        // asked. The build report is the canonical figure; this follows it.
        supabase.from('jobs').select('parts_cost, labor_cost')
          .eq('car_id', carId).eq('type', 'modification').eq('status', 'installed'),
        supabase.from('sessions').select('total_cost').eq('car_id', carId).eq('type', 'maintenance'),
        supabase.auth.getUser(),
      ])
      if (!alive) return

      const c = carRes.data as Car | null
      setCar(c)
      setMUnit(asMileageUnit(c?.mileage_unit))

      const rows = (fuelRes.error ? [] : (fuelRes.data ?? [])) as unknown as FuelEntry[]
      setSummary(summarise(rows.map(r => ({
        ...r,
        volume: r.volume == null ? null : Number(r.volume),
        total_cost: r.total_cost == null ? null : Number(r.total_cost),
      }))))

      const jobs = (jobsRes.data ?? []) as { parts_cost: number | null; labor_cost: number | null }[]
      setModSpend(jobs.reduce((s, j) => s + (j.parts_cost ?? 0) + (j.labor_cost ?? 0), 0))
      const svcs = (svcRes.data ?? []) as { total_cost: number | null }[]
      setServiceSpend(svcs.reduce((s, x) => s + (x.total_cost ?? 0), 0))

      const uid = meRes.data.user?.id
      if (uid) {
        const { data: u } = await supabase.from('users').select('volume_unit').eq('id', uid).single()
        if (alive) setVUnit(asVolumeUnit((u as { volume_unit?: string } | null)?.volume_unit))
      }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const carInfo = car ? [car.year, car.model, car.variant].filter(Boolean).join(' ') : ''
  const s = summary

  const fuelSpend = s?.totalSpend ?? 0
  const totalSpend = modSpend + serviceSpend + fuelSpend
  const pct = (v: number) => (totalSpend > 0 ? (v / totalSpend) * 100 : 0)
  // "0%" against a five-figure build reads as a broken number rather than a
  // small one, and the sentence it sits in is the point of the whole block.
  const fuelPctRaw = totalSpend > 0 ? (fuelSpend / totalSpend) * 100 : 0
  const fuelPct = fuelPctRaw > 0 && fuelPctRaw < 0.5 ? '<1%' : `${Math.round(fuelPctRaw)}%`

  const tanks = (s?.tanks ?? []).filter(t => t.mpg != null || t.reason === 'partial' || t.reason === 'missed')
  const mpgs = tanks.map(t => t.mpg).filter((v): v is number => v != null)
  const lo = mpgs.length ? Math.min(...mpgs) : 0
  const hi = mpgs.length ? Math.max(...mpgs) : 1
  // A bar is scaled within the observed range rather than from zero. Economy
  // never approaches zero, so a zero baseline would compress every real
  // difference into the top few pixels of the chart.
  const barH = (mpg: number) => 22 + (hi > lo ? ((mpg - lo) / (hi - lo)) * 46 : 23)

  const money = (v: number, dp = 0) =>
    '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: FIELD, fontFamily: FONT_UI, overflow: 'hidden' }}>
      <ArrivalFade />

      {/* ── Header ── the app's burgundy bar, unchanged. */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, zIndex: 10 }}>
        <svg viewBox="0 0 390 44" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
          <defs>
            <linearGradient id="fuelHdrGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={COLOR_BURGUNDY_L} />
              <stop offset="55%" stopColor={COLOR_BURGUNDY_M} />
              <stop offset="100%" stopColor={COLOR_BURGUNDY_R} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="390" height="44" fill={COLOR_HEADER_BLACK} />
          <rect x="0" y="0" width="390" height="44" fill="url(#fuelHdrGrad)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 0 6px' }}>
          <button onClick={() => navigate('/maintenance')} data-sfx="back"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
            <span style={{ color: COLOR_HEADER_TITLE, fontFamily: FONT_UI, fontStyle: 'italic', fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em' }}>Fuel</span>
          </button>
          {carInfo && (
            <span style={{ fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75 }}>{carInfo}</span>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {/* ── The cut ── the same clip path and tint as MaintenancePage, so the
            curve is the same curve rather than an approximation of it. */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
          <defs>
            <clipPath id="fuelLeftPanel" clipPathUnits="objectBoundingBox">
              <path d="M 0,0 L 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 Z" />
            </clipPath>
            <clipPath id="fuelAmberPanel" clipPathUnits="objectBoundingBox">
              <path d="M 0.66,0 C 0.92,0.22 0.20,0.72 0.0,0.86 L 0,1 L 1,1 L 1,0 Z" />
            </clipPath>
            <filter id="fuelGrain">
              <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          </defs>
        </svg>

        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 383, overflow: 'hidden' }}>
          {/* 0.85 / 0.54, one stop brighter than the family's 0.55 / 0.82. Their
              photos are mid-tone interiors that survive being buried; this is a
              dusk exterior that at 0.55 stops being a gas station and becomes a
              warm gradient. object-position 78% lifts the pump row out of the
              narrow end of the wedge. */}
          <img src={fuelHero} alt="" aria-hidden style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 78%',
            clipPath: 'url(#fuelLeftPanel)', opacity: 0.85,
          }} />
          <div style={{
            position: 'absolute', inset: 0, clipPath: 'url(#fuelLeftPanel)',
            background: 'linear-gradient(160deg, rgba(200,140,8,0.54) 0%, rgba(130,75,10,0.46) 50%, rgba(0,0,0,0) 100%)',
          }} />
          <div style={{
            position: 'absolute', inset: 0, clipPath: 'url(#fuelAmberPanel)',
            background: 'linear-gradient(155deg, #c47818 0%, #d48828 40%, #b86818 75%, #9a5812 100%)',
          }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.035, mixBlendMode: 'overlay' }} aria-hidden>
            <rect width="100%" height="100%" filter="url(#fuelGrain)" />
          </svg>
        </div>
        {/* Resolve the hero into the dark field the record sits on. */}
        <div style={{
          position: 'absolute', top: 250, left: 0, right: 0, height: 160, zIndex: 2,
          background: `linear-gradient(180deg, rgba(8,9,10,0) 0%, rgba(8,9,10,0.72) 58%, ${FIELD} 100%)`,
        }} />

        <div style={{ position: 'relative', zIndex: 5, padding: '0 16px 120px' }}>
          {/* ── The readout ── low in the hero. The wedge is widest at the top and
              closes to nothing by 86% down, so a full-width panel only fits once
              the curve has opened; that also hands the photo the whole top. */}
          <div style={{ marginTop: 188 }}>
            <LcdPanel legend="Average economy" unit="mpg" style={{ padding: '11px 11px 9px' }}>
              <div style={{ marginTop: 5 }}>
                <SevenSeg height={54} gap={5}
                          value={s?.avgMpg != null ? s.avgMpg.toFixed(1) : '--.-'}
                          label={s?.avgMpg != null ? `${s.avgMpg.toFixed(1)} miles per gallon` : 'No economy yet'} />
              </div>
            </LcdPanel>
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(245,245,245,0.42)' }}>
              {s && s.fullTanks > 0
                ? `${s.fullTanks} full tank${s.fullTanks === 1 ? '' : 's'} · best ${s.bestMpg?.toFixed(1)} · worst ${s.worstMpg?.toFixed(1)}`
                : 'Log two full tanks and the economy appears here'}
            </div>
          </div>

          {/* ── Three windows ── the pump's own arrangement, same instrument. */}
          <div style={{ display: 'flex', gap: 5, marginTop: 19 }}>
            {[
              { v: s?.costPerMile != null ? s.costPerMile.toFixed(2) : '-.--', cap: `$ per ${mUnit}` },
              { v: s?.avgPricePerGal != null ? s.avgPricePerGal.toFixed(2) : '-.--', cap: `$ per ${volumeLabel(vUnit)}` },
              // No thousands separator, deliberately. At this size the comma
              // glyph is two pixels of tail away from the decimal point in the
              // window beside it, so "2,694" read as "2.694" — a hundredfold
              // error in the one figure people check. A pump's own totalizer
              // does not group its digits either.
              { v: fuelSpend > 0 ? String(Math.round(fuelSpend)) : '0', cap: '$ to date' },
            ].map((w, i) => (
              <div key={i} style={{ flex: 1 }}>
                <LcdPanel style={{ padding: '7px 5px 6px' }}>
                  <SevenSeg height={22} gap={2} value={w.v} />
                </LcdPanel>
                <span style={{
                  display: 'block', marginTop: 4, textAlign: 'center', fontSize: 9, fontWeight: 800,
                  letterSpacing: '0.16em', textTransform: 'uppercase', color: `${CREAM}0.34)`,
                }}>{w.cap}</span>
              </div>
            ))}
          </div>

          {/* ── Chart ── the bars drawn ON the glass, dark on grey-green. */}
          <Section title="Economy per tank">
            <LcdPanel style={{ padding: '9px 8px 6px' }}>
              {/* justify + maxWidth, not flex:1 alone: with one tank logged a
                  lone flex:1 bar spans the whole panel and the striped fill
                  reads as a barcode rather than a column. Capped and centred,
                  two tanks look like two tanks and thirty still pack tight. */}
              <div style={{ position: 'relative', height: 69, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, zIndex: 2 }}>
                {tanks.length === 0 && (
                  <div style={{ margin: 'auto', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: lcdInk(0.4) }}>
                    NO TANKS YET
                  </div>
                )}
                {tanks.map((t, i) => (
                  <div key={t.entry.id} style={{
                    flex: '1 1 0', minWidth: 0, maxWidth: 30,
                    height: t.mpg != null ? barH(t.mpg) : 3,
                    background: t.mpg == null
                      ? lcdInk(0.16)
                      : `repeating-linear-gradient(to top, ${lcdInk(i === tanks.length - 1 ? 0.95 : 0.62)} 0 4px, transparent 4px 6px)`,
                  }} />
                ))}
                {s?.avgMpg != null && mpgs.length > 1 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: barH(s.avgMpg), borderTop: `1px dashed ${lcdInk(0.38)}` }}>
                    <span style={{ position: 'absolute', left: 0, top: -11, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', color: lcdInk(0.55) }}>
                      AVG {s.avgMpg.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </LcdPanel>
          </Section>

          {/* ── True cost ── the block no competitor can build. */}
          <Section title="What this car has cost you">
            <div style={{ padding: '9px 9px 8px', background: 'linear-gradient(180deg,#0b0c0d 0%,#101113 100%)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9), inset 0 1px 3px rgba(0,0,0,0.7)' }}>
              <div style={{ display: 'flex', height: 12, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9)' }}>
                <div style={{ width: `${pct(modSpend)}%`, background: COLOR_BRAND }} />
                <div style={{ width: `${pct(serviceSpend)}%`, background: SERVICE_GREY }} />
                <div style={{ width: `${pct(fuelSpend)}%`, background: COLOR_ACCENT }} />
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 9, flexWrap: 'wrap' }}>
                <Legend swatch={COLOR_BRAND} label="Mods" value={money(modSpend)} />
                <Legend swatch={SERVICE_GREY} label="Service" value={money(serviceSpend)} />
                <Legend swatch={COLOR_ACCENT} label="Fuel" value={money(fuelSpend)} />
              </div>
            </div>
            {fuelSpend > 0 && (
              <div style={{ marginTop: 9, fontSize: 13, fontWeight: 600, color: 'rgba(245,245,245,0.70)', lineHeight: 1.35 }}>
                Fuel is <b style={{ color: COLOR_ACCENT, fontWeight: 800 }}>{fuelPct}</b> of what this car has cost you, and it carries into the build report with the rest.
              </div>
            )}
          </Section>

          {/* ── The record ── quiet on purpose; the readouts carry the character. */}
          <Section title="Fill-ups">
            {!loading && tanks.length === 0 && (
              <div style={{ padding: '22px 0', fontSize: 13, color: 'rgba(245,245,245,0.42)' }}>
                No fill-ups yet. Log one from the grip at the foot of the Home map.
              </div>
            )}
            {[...(s?.tanks ?? [])].reverse().map(t => (
              <div key={t.entry.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                height: 44, borderTop: `1px solid ${CREAM}0.08)`,
              }}>
                <div>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#f5f5f5' }}>{fmtDate(t.entry.filled_on)}</b>
                  <i style={{ display: 'block', marginTop: 2, fontStyle: 'normal', fontSize: 12, fontWeight: 600, color: `${CREAM}0.38)` }}>
                    {milesToUnit(t.entry.odometer, mUnit).toLocaleString()} {mUnit}
                  </i>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#f5f5f5' }}>
                    {t.entry.total_cost != null ? money(t.entry.total_cost, 2) : '—'}
                  </b>
                  <i style={{ display: 'block', marginTop: 2, fontStyle: 'normal', fontSize: 12, fontWeight: 600, color: `${CREAM}0.38)` }}>
                    {t.entry.volume != null ? `${galToUnit(t.entry.volume, vUnit).toFixed(1)} ${volumeLabel(vUnit)}` : 'odometer'}
                  </i>
                </div>
                <div style={{ width: 78, textAlign: 'right' }}>
                  {t.mpg != null
                    ? <span style={{ fontSize: 16, fontWeight: 800, color: `${CREAM}0.92)` }}>{t.mpg.toFixed(1)} mpg</span>
                    // Honest about the rule rather than inventing a number:
                    // economy is only defined between two full tanks.
                    : <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: `${CREAM}0.30)` }}>
                        {REASON_LABEL[t.reason]}
                      </span>}
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  )
}

const REASON_LABEL: Record<string, string> = {
  ok: '', first: 'First', partial: 'Partial', missed: 'Missed', reading: 'Reading', 'bad-data': '—',
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[(m ?? 1) - 1]} ${d}${y && y !== new Date().getFullYear() ? ` ${y}` : ''}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 19 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${CREAM}0.34)`, textShadow: '0 1px 0 rgba(0,0,0,0.9)' }}>
        {title}
      </div>
      <div style={{ marginTop: 7 }}>{children}</div>
    </div>
  )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, background: swatch }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(245,245,245,0.55)' }}>{label}</span>
      <b style={{ fontSize: 12, fontWeight: 800, color: `${CREAM}0.92)` }}>{value}</b>
    </div>
  )
}
