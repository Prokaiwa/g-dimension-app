// /fuel — the fuel record (ADR-033).
//
// Reached from the Fuel tile on the Maintenance hub. The primary capture path is
// still the grip on Home — logging a fill-up is a ten-second job at a pump, which
// is the worst connection the app ever sees, and a route there would mean a lazy
// chunk fetch before the first field could be typed into. But the same sheet is
// mounted HERE too, from a FAB and from any row in the log, because the forecourt
// is not the only place people do this: the other half of the time it is an
// evening with a stack of receipts. One sheet, so there is one form and one set
// of rules whichever door you came through.
//
// AESTHETIC. This is Maintenance's third room, so it is built from the same
// parts as the other two: MaintenanceServicePage and MaintenanceDetailPage are
// byte-identical in structure, and this now matches them — one full-bleed
// background behind the whole screen (photo under the S-curve, amber panel over
// it, grain, then a vignette that darkens the lower half), the same flat black
// header with `‹ Maintenance` and the date chips, and content that scrolls over
// a background that does not move.
//
// The one thing that is this room's alone is the instrument. Every figure sits
// on a pump LCD (components/SevenSeg) rather than in amber type, because an
// earlier pass ran amber numerals on the amber hero and the colour story
// collapsed. Amber is the PLACE; grey-green is the INSTRUMENT.
//
// WHAT USED TO BE HERE. A "What this car has cost you" block split spending
// three ways across mods, service and fuel. It was the one thing no competitor
// could build, and it was still wrong here: a section about fuel is not the
// place to be told what your turbo cost. The comparison belongs in the build
// report, where the whole car is the subject. The fuel total survives as the
// third LCD window.

const _now = new Date()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_LABEL = MONTHS[_now.getMonth()]
const DAY_LABEL = String(_now.getDate())

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActiveCarId } from '../lib/activeCar'
import { asMileageUnit, milesToUnit, type MileageUnit } from '../lib/mileage'
import { loadUnitPrefs } from '../lib/unitPrefs'
import { loadFuelUnits, DEFAULT_FUEL_UNITS, type FuelUnits } from '../lib/fuelUnits'
import {
  summarise, galToUnit, volumeLabel, economyLabel, formatEconomy,
  type FuelEntry, type FuelSummary,
} from '../lib/fuel'
import { SevenSeg, LcdPanel, lcdInk } from '../components/SevenSeg'
import FuelSheet, { type FuelSheetCar } from '../components/FuelSheet'
import ArrivalFade from '../components/ArrivalFade'
import fuelHero from '../assets/backgrounds/fuel_hero.webp'
import {
  COLOR_HEADER_WARM, COLOR_HEADER_TITLE, COLOR_HEADER_BLACK, COLOR_BURGUNDY_L,
  COLOR_ACCENT, FONT_UI, HEADER_HEIGHT, RADIUS_BUTTON,
} from '../tokens'

const FIELD = '#08090a'
const CREAM = 'rgba(240,228,200,'

type Car = { year: number | null; model: string | null; variant: string | null; mileage_unit: string | null; current_mileage: number | null }

export default function FuelPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [bgLoaded, setBgLoaded] = useState(false)
  const [car, setCar] = useState<Car | null>(null)
  const [mUnit, setMUnit] = useState<MileageUnit>('mi')
  const [units, setUnits] = useState<FuelUnits>(DEFAULT_FUEL_UNITS)
  const [summary, setSummary] = useState<FuelSummary | null>(null)
  const [entries, setEntries] = useState<FuelEntry[]>([])
  const [carId, setCarId] = useState<string | null>(null)
  // Capture also lives here, not only on Home. The grip is for the forecourt;
  // this is for the evening you sit down with a stack of receipts. Same sheet,
  // so there is one form and one set of rules either way.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<FuelEntry | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const carId = await getActiveCarId()
      if (!carId) { if (alive) setLoading(false); return }
      if (alive) setCarId(carId)

      const [carRes, fuelRes, meRes] = await Promise.all([
        supabase.from('cars').select('year, model, variant, mileage_unit, current_mileage').eq('id', carId).single(),
        // Guarded like every other post-migration read in this codebase: before
        // 097 is applied the table does not exist and this 404s, which must
        // degrade to an empty log rather than an error screen.
        supabase.from('fuel_entries')
          .select('id, filled_on, odometer, volume, total_cost, is_full, is_missed')
          .eq('car_id', carId).order('odometer', { ascending: true }),
        supabase.auth.getUser(),
      ])
      if (!alive) return

      const c = carRes.data as Car | null
      setCar(c)
      setMUnit(asMileageUnit(c?.mileage_unit))

      const rows = ((fuelRes.error ? [] : (fuelRes.data ?? [])) as unknown as FuelEntry[]).map(r => ({
        ...r,
        volume: r.volume == null ? null : Number(r.volume),
        total_cost: r.total_cost == null ? null : Number(r.total_cost),
      }))
      setEntries(rows)
      setSummary(summarise(rows))

      const uid = meRes.data.user?.id
      if (uid) {
        const prefs = await loadUnitPrefs()
        const u = await loadFuelUnits(uid, prefs.distance_unit)
        if (alive) setUnits(u)
      }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [reload])

  const carInfo = car ? [car.year, car.model, car.variant].filter(Boolean).join(' ') : ''
  const s = summary
  const eLabel = economyLabel(units.economy)

  const tanks = (s?.tanks ?? []).filter(t => t.mpg != null || t.reason === 'partial' || t.reason === 'missed')
  const mpgs = tanks.map(t => t.mpg).filter((v): v is number => v != null)
  const lo = mpgs.length ? Math.min(...mpgs) : 0
  const hi = mpgs.length ? Math.max(...mpgs) : 1
  // Bars are scaled by raw MPG, i.e. by EFFICIENCY, never by the displayed
  // figure. In L/100km a better tank is a smaller number, so scaling by what is
  // printed would silently flip the chart upside down for half the world. This
  // way taller always means thriftier, whatever the axis is called.
  //
  // Scaled within the observed range rather than from zero: economy never
  // approaches zero, so a zero baseline would compress every real difference
  // into the top few pixels.
  const barH = (mpg: number) => 22 + (hi > lo ? ((mpg - lo) / (hi - lo)) * 46 : 23)

  const money = (v: number, dp = 0) =>
    '$' + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

  const sheetCar: FuelSheetCar | null = carId && car
    ? { id: carId, name: carInfo, mileageUnit: mUnit, currentMileage: car.current_mileage }
    : null

  return (
    <div style={{ height: '100dvh', position: 'relative', overflow: 'hidden', fontFamily: FONT_UI }}>
      <ArrivalFade />

      {/* ── Background layers ── the Service/Detail construction exactly: one
          full-bleed stack behind the whole screen, not a band at the top. */}
      <div style={{ position: 'absolute', inset: 0, background: FIELD }} />

      <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
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

      {/* Hero photo — left panel only.
          0.85 rather than the family's 0.55: their photos are mid-tone interiors
          that survive being buried, this is a dusk exterior that at 0.55 stops
          being a gas station and becomes a gradient.

          THE CLIP AND THE CROP ARE SEPARATE ELEMENTS, and they have to be.
          `clip-path` resolves in the element's own coordinate space BEFORE its
          transform, so putting both on the <img> would scale the S-curve along
          with the picture. The wrapper owns the curve; the image inside owns the
          framing.

          A wrapper is needed at all because objectPosition ran out of lever. The
          box is 430x932 (ratio 0.46) and the source is 1600x2133 (0.75), so
          `cover` scales by HEIGHT: the whole vertical is already visible and the
          Y position does nothing. Filling the screen with the entire frame put
          the flat underside of the canopy across the top and buried the lit pump
          row down where the wedge has closed. transform-origin picks the part of
          the photo that matters and scale brings it up to where the wedge is
          still wide. */}
      <div style={{ position: 'absolute', inset: 0, clipPath: 'url(#fuelLeftPanel)', overflow: 'hidden' }}>
        <img
          src={fuelHero} alt="" aria-hidden
          onLoad={() => setBgLoaded(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center',
            // Chosen off a ladder of eight (design/fuel-mockup/crop-test.mjs).
            // This one puts the receding row of canopy lights across the top of
            // the wedge, the pillar down its middle, the sunset horizon at the
            // left edge, and the orange pump tops just under the readout.
            transform: 'scale(1.7)', transformOrigin: '32% 76%',
            opacity: bgLoaded ? 0.85 : 0,
            transition: 'opacity 400ms ease',
          }}
        />
      </div>
      <div style={{
        position: 'absolute', inset: 0, clipPath: 'url(#fuelLeftPanel)', pointerEvents: 'none',
        background: 'linear-gradient(160deg, rgba(200,140,8,0.54) 0%, rgba(130,75,10,0.46) 50%, rgba(0,0,0,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, clipPath: 'url(#fuelAmberPanel)', pointerEvents: 'none',
        background: 'linear-gradient(155deg, #c47818 0%, #d48828 40%, #b86818 75%, #9a5812 100%)',
      }} />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.04, mixBlendMode: 'overlay' }} aria-hidden>
        <rect width="100%" height="100%" filter="url(#fuelGrain)" />
      </svg>
      {/* Bottom vignette. Deeper than Service/Detail's (0.70 / 0.10 / transparent
          at 55%) because this room's lower half carries a chart and a log rather
          than a short list, and the amber runs further down the frame here. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(4,5,6,0.94) 0%, rgba(4,5,6,0.80) 22%, rgba(4,5,6,0.42) 44%, rgba(4,5,6,0.10) 62%, transparent 78%)',
      }} />

      {/* ── Header ── identical to Service and Detail. */}
      <div style={{ position: 'relative', height: HEADER_HEIGHT, flexShrink: 0, background: COLOR_HEADER_BLACK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 14, borderBottom: '1px solid rgba(255,255,255,0.04)', zIndex: 10 }}>
        <button onClick={() => navigate('/maintenance')} data-sfx="back" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 4px 4px', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ color: COLOR_HEADER_WARM, fontSize: 22, fontWeight: 300, lineHeight: 1 }}>‹</span>
          <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_HEADER_TITLE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Maintenance</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {carInfo && <span style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: COLOR_HEADER_WARM, letterSpacing: '0.04em', opacity: 0.75, display: 'flex', alignItems: 'center', paddingRight: 10, whiteSpace: 'nowrap' }}>{carInfo}</span>}
          <div style={{ background: 'rgba(242,238,228,0.94)', color: '#0d0d0d', padding: '4px 7px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{MONTH_LABEL}</div>
          <div style={{ background: COLOR_BURGUNDY_L, color: '#fff', padding: '4px 8px', fontFamily: FONT_UI, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: DAY_LABEL.length === 1 ? 24 : 30 }}>{DAY_LABEL}</div>
        </div>
      </div>

      {/* ── Section label ── the family's, so the room announces itself the same way. */}
      <div style={{ position: 'relative', zIndex: 5, padding: '14px 16px 6px' }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,238,205,0.82)', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>
          Fuel Record
        </div>
      </div>

      {/* ── Content ── scrolls over a background that does not move. */}
      <div style={{
        position: 'relative', zIndex: 5,
        height: `calc(100dvh - ${HEADER_HEIGHT + 34}px)`,
        overflowY: 'auto', overscrollBehavior: 'contain',
        // 84 = the FAB's 28px inset + its 44px height + a gap, so the last row
        // of the log is never parked underneath it.
        padding: `0 16px calc(84px + env(safe-area-inset-bottom))`,
      }}>
        {/* ── The readout ── high in the frame now that the photo runs the whole
            height; the wedge is widest at the top, so a full-width panel sits
            clear of the curve from here down. */}
        <div style={{ marginTop: 128 }}>
          <LcdPanel legend="Average economy" unit={eLabel} style={{ padding: '11px 11px 9px' }}>
            <div style={{ marginTop: 5 }}>
              <SevenSeg height={54} gap={5}
                        value={s?.avgMpg != null ? formatEconomy(s.avgMpg, units.economy) : '--.-'}
                        label={s?.avgMpg != null ? `${formatEconomy(s.avgMpg, units.economy)} ${eLabel}` : 'No economy yet'} />
            </div>
          </LcdPanel>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(245,245,245,0.62)', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            {s && s.fullTanks > 0
              ? `${s.fullTanks} full tank${s.fullTanks === 1 ? '' : 's'} · best ${formatEconomy(s.bestMpg as number, units.economy)} · worst ${formatEconomy(s.worstMpg as number, units.economy)}`
              : 'Log two full tanks and your fuel economy appears here'}
          </div>
        </div>

        {/* ── Three windows ── the pump's own arrangement, same instrument. */}
        <div style={{ display: 'flex', gap: 5, marginTop: 19 }}>
          {[
            { v: s?.costPerMile != null ? s.costPerMile.toFixed(2) : '-.--', cap: `$ per ${mUnit}` },
            { v: s?.avgPricePerGal != null ? galPrice(s.avgPricePerGal, units).toFixed(2) : '-.--', cap: `$ per ${volumeLabel(units.volume)}` },
            // No thousands separator, deliberately. At this size the comma glyph
            // is two pixels of tail away from the decimal point in the window
            // beside it, so "2,694" read as "2.694".
            { v: (s?.totalSpend ?? 0) > 0 ? String(Math.round(s?.totalSpend ?? 0)) : '0', cap: '$ to date' },
          ].map((w, i) => (
            <div key={i} style={{ flex: 1, minWidth: 0 }}>
              <LcdPanel style={{ padding: '7px 5px 6px' }}>
                <SevenSeg height={22} gap={2} value={w.v} />
              </LcdPanel>
              <span style={{
                display: 'block', marginTop: 4, textAlign: 'center', fontSize: 9, fontWeight: 800,
                letterSpacing: '0.16em', textTransform: 'uppercase', color: `${CREAM}0.52)`,
                textShadow: '0 1px 3px rgba(0,0,0,0.7)',
              }}>{w.cap}</span>
            </div>
          ))}
        </div>

        {/* ── Chart ── the bars drawn ON the glass, dark on grey-green. */}
        <Section title="Economy per tank">
          <LcdPanel style={{ padding: '9px 8px 6px' }}>
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
                    AVG {formatEconomy(s.avgMpg, units.economy)}
                  </span>
                </div>
              )}
            </div>
          </LcdPanel>
        </Section>

        {/* ── The record ── quiet on purpose; the readouts carry the character.
            Rows carry their own semi-opaque band, the same device Service and
            Detail use, so text stays legible wherever the background is bright. */}
        <Section title="Fill-ups">
          {/* `entries`, not `tanks`. The latter is the CHART's list and filters
              out the 'first' entry (it has no economy figure yet), so a log with
              exactly one fill-up in it announced that it was empty — directly
              above the fill-up. */}
          {!loading && entries.length === 0 && (
            <div style={{ padding: '20px 14px', background: 'rgba(4,5,6,0.55)', fontSize: 13, lineHeight: 1.45, color: 'rgba(245,245,245,0.62)' }}>
              No fill-ups yet. Tap Fill-up to add your first one, or use the small bar at the bottom of the Home screen.
            </div>
          )}
          {[...(s?.tanks ?? [])].reverse().map((t, i) => (
            // A row is a button: tapping it edits that fill-up. Until this
            // existed a typo'd odometer was permanent, and it poisons TWO tanks
            // (the one it ends and the one it starts), which is the one thing
            // this feature cannot shrug off.
            <button
              key={t.entry.id}
              onClick={() => { setEditEntry(t.entry); setSheetOpen(true) }}
              style={{
                width: '100%', textAlign: 'left', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                height: 46, padding: '0 12px', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                background: i % 2 === 0 ? 'rgba(4,5,6,0.62)' : 'rgba(4,5,6,0.44)',
                borderBottom: `1px solid ${CREAM}0.06)`,
              }}>
              <div>
                <b style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#f5f5f5' }}>{fmtDate(t.entry.filled_on)}</b>
                <i style={{ display: 'block', marginTop: 2, fontStyle: 'normal', fontSize: 12, fontWeight: 600, color: `${CREAM}0.44)` }}>
                  {milesToUnit(t.entry.odometer, mUnit).toLocaleString()} {mUnit}
                </i>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#f5f5f5' }}>
                  {t.entry.total_cost != null ? money(t.entry.total_cost, 2) : '—'}
                </b>
                <i style={{ display: 'block', marginTop: 2, fontStyle: 'normal', fontSize: 12, fontWeight: 600, color: `${CREAM}0.44)` }}>
                  {t.entry.volume != null ? `${galToUnit(t.entry.volume, units.volume).toFixed(1)} ${volumeLabel(units.volume)}` : 'odometer'}
                </i>
              </div>
              <div style={{ width: 86, textAlign: 'right' }}>
                {t.mpg != null
                  ? <span style={{ fontSize: 15, fontWeight: 800, color: `${CREAM}0.92)` }}>{formatEconomy(t.mpg, units.economy)} {eLabel}</span>
                  // Honest about the rule rather than inventing a number:
                  // economy is only defined between two full tanks.
                  : <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: `${CREAM}0.32)` }}>
                      {REASON_LABEL[t.reason]}
                    </span>}
              </div>
            </button>
          ))}
        </Section>
      </div>

      {/* ── FAB ── the family's, in this room's colour. */}
      <button
        onClick={() => { setEditEntry(null); setSheetOpen(true) }}
        style={{
          position: 'fixed', right: 20, bottom: 'calc(28px + env(safe-area-inset-bottom))',
          height: 44, paddingLeft: 20, paddingRight: 20,
          background: COLOR_ACCENT, border: 'none', borderRadius: RADIUS_BUTTON,
          color: '#fff5dc', fontFamily: FONT_UI, fontWeight: 700, fontSize: 13,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          cursor: 'pointer', zIndex: 20,
          boxShadow: '0 4px 16px rgba(0,0,0,0.60)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 300, lineHeight: 1, marginTop: -1 }}>+</span>
        Fill-up
      </button>

      {/* Safe as a child here, unlike on Home: this page has no `perspective`
          and nothing on the way up carries a transform, so the sheet's
          position:fixed still resolves against the viewport. */}
      <FuelSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditEntry(null) }}
        car={sheetCar}
        volumeUnit={units.volume}
        economyUnit={units.economy}
        recent={entries}
        entry={editEntry}
        showHistoryLink={false}
        onSaved={() => setReload(n => n + 1)}
      />
    </div>
  )
}

/** summarise() works in US gallons because storage does. The per-unit price has
 *  to be re-derived in the display unit, not just relabelled. */
function galPrice(perUsGal: number, units: FuelUnits): number {
  return perUsGal / (galToUnit(1, units.volume) || 1)
}

const REASON_LABEL: Record<string, string> = {
  ok: '', first: 'First', partial: 'Partial', missed: 'Missed', reading: 'Reading', 'bad-data': '—',
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS_SHORT[(m ?? 1) - 1]} ${d}${y && y !== new Date().getFullYear() ? ` ${y}` : ''}`
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 19 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${CREAM}0.5)`, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {title}
      </div>
      <div style={{ marginTop: 7 }}>{children}</div>
    </div>
  )
}
