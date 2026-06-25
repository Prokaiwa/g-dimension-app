// Route: /garage/cars/:carId/edit — Edit Car (Part 10)
//
// The full editable car form. Reached from the read-only Details view in the
// carousel (GarageCarsPage). Mirrors how mods and parts work — a read screen
// plus a dedicated edit screen — rather than editing inline. Saving or removing
// returns to the carousel, focused on this car.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { prewarmBackgroundRemoval } from '../lib/backgroundRemoval'
import { uploadGaragePhoto, uploadCarOriginal } from '../lib/carPhoto'
import { getCarPrivate, upsertCarPrivate } from '../lib/carPrivate'
import CarPhotoUpload from '../components/CarPhotoUpload'
import { GarageBg, GarageHeader } from './GarageCarsPage'
import {
  COLOR_CAVITY_BG,
  COLOR_HEADER_WARM,
  COLOR_HEADER_TITLE,
  COLOR_ACCENT,
  COLOR_PANEL_TEXT,
  GRADIENT_PANEL,
  COLOR_PANEL_LINE,
  COLOR_TEXT_SECONDARY,
  FONT_UI,
  FONT_TITLE,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  SPACE_LG,
} from '../tokens'

const LABEL: React.CSSProperties = {
  fontFamily: FONT_UI, fontWeight: 700, fontSize: 10,
  letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR_TEXT_SECONDARY,
}
const INPUT: React.CSSProperties = {
  background: GRADIENT_PANEL, border: 'none',
  borderBottom: `1px solid ${COLOR_PANEL_LINE}`,
  padding: '8px 10px', fontFamily: FONT_UI, fontWeight: 600,
  fontSize: 16, color: COLOR_PANEL_TEXT, outline: 'none',
  width: '100%', boxSizing: 'border-box', WebkitAppearance: 'none',
}
const SELECT = { ...INPUT, WebkitAppearance: 'auto' } as unknown as React.CSSProperties
const FIELD: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: SPACE_XS }
const OPT:   React.CSSProperties = { fontWeight: 400, opacity: 0.45, fontSize: 9 }

type CarMeta = { year: number | null; make: string | null; model: string | null; variant: string | null }
type Details = Record<string, string>

const DETAIL_COLUMNS =
  // Sensitive fields (vin, license_plate, purchase_price/currency/dealer,
  // mileage_at_purchase) now live in car_private (migration 061) — read via
  // getCarPrivate, not from this list.
  'year, make, model, variant, color, paint_code, nickname, trim, current_mileage, chassis_code, engine_type, engine_origin, forced_induction, horsepower, torque, transmission, drivetrain, usage_type, oil_type, tire_size, battery_model, purchase_date, purchase_story, garage_photo_url, is_public, show_buildsheet_publicly, show_timeline_publicly, show_featured_publicly'

// A from-scratch switch (no component libraries). Amber when on.
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={disabled ? undefined : onChange} aria-pressed={on}
      style={{
        width: 44, height: 26, borderRadius: 9999, border: 'none', flexShrink: 0, padding: 0,
        background: on ? COLOR_ACCENT : 'rgba(255,255,255,0.14)',
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
        position: 'relative', transition: 'background 180ms ease',
      }}>
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20,
        borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        transition: 'left 180ms cubic-bezier(0.22,1,0.36,1)',
      }} />
    </button>
  )
}

function PrivacyRow({ title, sub, on, onChange, disabled }: { title: string; sub?: string; on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', opacity: disabled ? 0.4 : 1 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 13, color: COLOR_PANEL_TEXT }}>{title}</div>
        {sub && <div style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 11, color: COLOR_TEXT_SECONDARY, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} disabled={disabled} />
    </div>
  )
}

export default function GarageCarsEditPage() {
  const navigate = useNavigate()
  const { carId } = useParams<{ carId: string }>()

  const [meta, setMeta]       = useState<CarMeta | null>(null)
  const [data, setData]       = useState<Details | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null)
  const [photoOriginal, setPhotoOriginal] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [privacy, setPrivacy] = useState({ isPublic: true, buildsheet: true, timeline: true, featured: true })

  // Warm the background-removal model so the photo picker is instant.
  useEffect(() => { prewarmBackgroundRemoval() }, [])

  useEffect(() => {
    if (!carId) return
    let active = true
    Promise.all([
      supabase.from('cars').select(DETAIL_COLUMNS).eq('id', carId).is('deleted_at', null).single(),
      getCarPrivate(carId),
    ])
      .then(([{ data: row }, priv]) => {
        if (!active) return
        if (!row) { setLoading(false); return }
        setMeta({ year: row.year, make: row.make, model: row.model, variant: row.variant })
        setData({
          color:             row.color              ?? '',
          colorCode:         row.paint_code         ?? '',
          nickname:          row.nickname            ?? '',
          trim:              row.trim               ?? '',
          variant:           row.variant            ?? '',
          mileage:           row.current_mileage    != null ? String(row.current_mileage) : '',
          mileageUnit:       'mi',
          chassisCode:       row.chassis_code       ?? '',
          vin:               priv.vin               ?? '',
          licensePlate:      priv.license_plate     ?? '',
          engineType:        row.engine_type         ?? '',
          engineOrigin:      row.engine_origin       ?? '',
          usageType:         row.usage_type          ?? '',
          forcedInduction:   row.forced_induction    ?? 'none',
          horsepower:        row.horsepower         != null ? String(row.horsepower) : '',
          torque:            row.torque             != null ? String(row.torque) : '',
          transmission:      row.transmission       ?? '',
          drivetrain:        row.drivetrain         ?? '',
          oilType:           row.oil_type           ?? '',
          tireSize:          row.tire_size          ?? '',
          batteryModel:      row.battery_model      ?? '',
          purchaseDate:      row.purchase_date      ?? '',
          purchasePrice:     priv.purchase_price     != null ? String(priv.purchase_price) : '',
          purchaseCurrency:  priv.purchase_currency  ?? 'USD',
          mileageAtPurchase: priv.mileage_at_purchase != null ? String(priv.mileage_at_purchase) : '',
          wherePurchased:    priv.purchase_dealer    ?? '',
          originStory:       row.purchase_story     ?? '',
        })
        setPhotoUrl(row.garage_photo_url ?? null)
        setPrivacy({
          isPublic:   row.is_public !== false,
          buildsheet: row.show_buildsheet_publicly !== false,
          timeline:   row.show_timeline_publicly !== false,
          featured:   row.show_featured_publicly !== false,
        })
        setLoading(false)
      })
    return () => { active = false }
  }, [carId])

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setData(d => ({ ...d!, [k]: e.target.value }))

  function backToCarousel() {
    navigate('/garage/cars', { state: { focusCarId: carId } })
  }

  async function save() {
    if (!data || !meta || !carId) return
    setSaving(true); setErr(null)
    const rawMileage = parseInt(data.mileage) || null
    const mileageInMiles = rawMileage && data.mileageUnit === 'km'
      ? Math.round(rawMileage * 0.621371) : rawMileage
    const update: Record<string, unknown> = {
      color:             data.color.trim()            || null,
      paint_code:        (data.colorCode ?? '').trim() || null,
      nickname:          data.nickname.trim()         || null,
      trim:              data.trim.trim()             || null,
      variant:           data.variant?.trim()         || null,
      current_mileage:   mileageInMiles,
      chassis_code:      data.chassisCode?.trim()     || null,
      engine_type:       data.engineType?.trim()      || null,
      engine_origin:     data.engineOrigin            || null,
      usage_type:        data.usageType               || null,
      forced_induction:  data.forcedInduction         || 'none',
      horsepower:        parseInt(data.horsepower)    || null,
      torque:            parseInt(data.torque)        || null,
      transmission:      data.transmission            || null,
      drivetrain:        data.drivetrain              || null,
      oil_type:          data.oilType?.trim()         || null,
      tire_size:         data.tireSize?.trim()        || null,
      battery_model:     data.batteryModel?.trim()    || null,
      purchase_date:     data.purchaseDate            || null,
      purchase_story:    data.originStory.trim()      || null,
      is_public:                 privacy.isPublic,
      show_buildsheet_publicly:  privacy.buildsheet,
      show_timeline_publicly:    privacy.timeline,
      show_featured_publicly:    privacy.featured,
    }
    let photoFailed = false
    let originalUrl: string | null = null
    if (photoBlob) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          update.garage_photo_url = await uploadGaragePhoto(user.id, carId, photoBlob)
          if (photoOriginal) {
            try { originalUrl = await uploadCarOriginal(user.id, carId, photoOriginal) } catch { /* best-effort */ }
          }
        }
      } catch {
        photoFailed = true
      }
    }
    const { error } = await supabase.from('cars').update(update).eq('id', carId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    // Sensitive fields live in car_private (migration 061) — owner-only, never
    // exposed by the public cars policy. Written separately, best-effort.
    {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await upsertCarPrivate(carId, user.id, {
          vin:                 data.vin?.trim()                 || null,
          license_plate:       data.licensePlate?.trim()        || null,
          purchase_price:      parseFloat(data.purchasePrice)   || null,
          purchase_currency:   data.purchaseCurrency            || 'USD',
          mileage_at_purchase: parseInt(data.mileageAtPurchase) || null,
          purchase_dealer:     data.wherePurchased.trim()       || null,
        })
      }
    }
    // Persist the original separately so a pre-migration column gap can never block the main save.
    if (originalUrl) {
      try { await supabase.from('cars').update({ original_photo_url: originalUrl }).eq('id', carId) } catch { /* ignore */ }
    }
    if (photoFailed) {
      setErr('Photo upload failed — your other changes were saved. Tap Save again to retry the photo.')
      return
    }
    backToCarousel()
  }

  async function removeCar() {
    if (!carId) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from('cars').update({ deleted_at: new Date().toISOString() }).eq('id', carId)
    setSaving(false)
    if (error) { setErr(error.message); return }
    navigate('/garage/cars')
  }

  const ctaStyle: React.CSSProperties = {
    width: '100%', padding: '14px', background: COLOR_ACCENT, border: 'none', color: '#fff',
    fontFamily: FONT_UI, fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase',
    cursor: 'pointer', transition: '200ms ease-out', opacity: saving ? 0.6 : 1,
  }

  return (
    <div style={{ height: '100dvh', background: COLOR_CAVITY_BG, position: 'relative', overflow: 'hidden', fontFamily: FONT_UI, display: 'flex', flexDirection: 'column' }}>
      <style>{`.form-scroll{-webkit-overflow-scrolling:touch;scrollbar-width:none}.form-scroll::-webkit-scrollbar{display:none}`}</style>
      <GarageBg />
      <GarageHeader onBack={() => confirmDelete ? setConfirmDelete(false) : backToCarousel()} />

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <span style={{ fontFamily: FONT_UI, fontSize: 12, color: 'rgba(245,245,245,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</span>
        </div>
      ) : !data || !meta ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SPACE_MD, position: 'relative', zIndex: 1, padding: `0 ${SPACE_LG}px` }}>
          <p style={{ fontFamily: FONT_UI, fontWeight: 600, fontSize: 14, color: 'rgba(245,245,245,0.5)' }}>Couldn’t load this car.</p>
          <button onClick={() => navigate('/garage/cars')} style={{ ...ctaStyle, width: 'auto', padding: '12px 22px' }}>Back to garage</button>
        </div>
      ) : !confirmDelete ? (
        <>
          <div className="form-scroll" style={{ flex: 1, overflowY: 'auto', padding: `${SPACE_MD}px ${SPACE_MD}px 0`, position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: SPACE_LG }}>
              <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 28, color: COLOR_HEADER_TITLE, margin: '0 0 4px', lineHeight: 1.1 }}>
                {meta.year} {meta.model}
              </p>
              <p style={{ fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, color: 'rgba(245,245,245,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                {meta.make}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_SM }}>
              <div style={FIELD}>
                <span style={LABEL}>Car Photo <span style={OPT}>opt</span></span>
                <CarPhotoUpload currentUrl={photoUrl} onChange={(b, f) => { setPhotoBlob(b); setPhotoOriginal(f ?? null) }} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Paint Color <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="words" placeholder="e.g. Midnight Purple II, Championship White" value={data.color} onChange={upd('color')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Paint Color Code <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="e.g. TT2, NH-0, A66" value={data.colorCode ?? ''} onChange={upd('colorCode')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Nickname <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="words" placeholder="e.g. The S14, Project R" value={data.nickname} onChange={upd('nickname')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Variant <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="words" placeholder="e.g. 430, Type R, GT-R" value={data.variant ?? ''} onChange={upd('variant')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Trim <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="words" value={data.trim} onChange={upd('trim')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Current Mileage</span>
                <div style={{ display: 'flex', gap: SPACE_SM }}>
                  <input type="number" inputMode="numeric" value={data.mileage} onChange={upd('mileage')} style={{ ...INPUT, flex: 1 }} />
                  <button type="button" onClick={() => setData(d => ({ ...d!, mileageUnit: d!.mileageUnit === 'mi' ? 'km' : 'mi' }))} style={{ flexShrink: 0, padding: '8px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: COLOR_HEADER_WARM, fontFamily: FONT_UI, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', cursor: 'pointer', borderRadius: 2 }}>
                    {data.mileageUnit}
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
              <span style={{ ...LABEL, opacity: 0.4 }}>Vehicle Specs</span>
              <div style={FIELD}>
                <span style={LABEL}>Chassis Code <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="e.g. S14, BNR32, JZA80" value={data.chassisCode ?? ''} onChange={upd('chassisCode')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>VIN <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="17-character VIN" value={data.vin ?? ''} onChange={upd('vin')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>License Plate <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" value={data.licensePlate ?? ''} onChange={upd('licensePlate')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Engine <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="e.g. SR20DET, 2JZ-GTE, RB26" value={data.engineType ?? ''} onChange={upd('engineType')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Engine Origin <span style={OPT}>opt</span></span>
                <select value={data.engineOrigin ?? ''} onChange={upd('engineOrigin')} style={SELECT}>
                  <option value="">— select —</option>
                  <option value="original">Original</option>
                  <option value="swapped">Swapped</option>
                </select>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Primary Use <span style={OPT}>opt</span></span>
                <select value={data.usageType ?? ''} onChange={upd('usageType')} style={SELECT}>
                  <option value="">— select —</option>
                  <option value="street">Street</option>
                  <option value="daily">Daily Driver</option>
                  <option value="track">Track</option>
                  <option value="drift">Drift</option>
                  <option value="drag">Drag</option>
                  <option value="show">Show / Stance</option>
                  <option value="vip">VIP</option>
                  <option value="offroad">Off-Road</option>
                </select>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Forced Induction</span>
                <select value={data.forcedInduction ?? 'none'} onChange={upd('forcedInduction')} style={SELECT}>
                  <option value="none">None (N/A)</option>
                  <option value="turbo">Turbo</option>
                  <option value="twin-turbo">Twin Turbo</option>
                  <option value="supercharged">Supercharged</option>
                  <option value="e-boost">E-Boost</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE_SM }}>
                <div style={FIELD}>
                  <span style={LABEL}>Horsepower <span style={OPT}>hp</span></span>
                  <input type="number" inputMode="numeric" placeholder="276" value={data.horsepower ?? ''} onChange={upd('horsepower')} style={INPUT} />
                </div>
                <div style={FIELD}>
                  <span style={LABEL}>Torque <span style={OPT}>lb-ft</span></span>
                  <input type="number" inputMode="numeric" placeholder="260" value={data.torque ?? ''} onChange={upd('torque')} style={INPUT} />
                </div>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Transmission</span>
                <select value={data.transmission ?? ''} onChange={upd('transmission')} style={SELECT}>
                  <option value="">— select —</option>
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                  <option value="sequential">Sequential</option>
                  <option value="cvt">CVT</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Drivetrain</span>
                <select value={data.drivetrain ?? ''} onChange={upd('drivetrain')} style={SELECT}>
                  <option value="">— select —</option>
                  <option value="rwd">RWD</option>
                  <option value="fwd">FWD</option>
                  <option value="awd">AWD</option>
                  <option value="4wd">4WD</option>
                </select>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Oil Type <span style={OPT}>opt</span></span>
                <input type="text" placeholder="e.g. 5W-30 Full Synthetic" value={data.oilType ?? ''} onChange={upd('oilType')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Tire Size <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="e.g. 225/45R17" value={data.tireSize ?? ''} onChange={upd('tireSize')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Battery Model <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="characters" placeholder="e.g. Optima Red Top 34/78" value={data.batteryModel ?? ''} onChange={upd('batteryModel')} style={INPUT} />
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
              <span style={{ ...LABEL, opacity: 0.4 }}>Purchase Info</span>
              <div style={FIELD}>
                <span style={LABEL}>Purchase Date <span style={OPT}>opt</span></span>
                <input type="date" value={data.purchaseDate} onChange={upd('purchaseDate')} min="1900-01-01" max="2030-12-31" style={SELECT} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 76px', gap: SPACE_SM }}>
                <div style={FIELD}>
                  <span style={LABEL}>Purchase Price <span style={OPT}>opt</span></span>
                  <input type="number" inputMode="decimal" value={data.purchasePrice} onChange={upd('purchasePrice')} style={INPUT} />
                </div>
                <div style={FIELD}>
                  <span style={LABEL}>Currency</span>
                  <select value={data.purchaseCurrency} onChange={upd('purchaseCurrency')} style={SELECT}>
                    {['USD','CAD','GBP','EUR','JPY','AUD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Mileage at Purchase <span style={OPT}>opt</span></span>
                <input type="number" inputMode="numeric" value={data.mileageAtPurchase} onChange={upd('mileageAtPurchase')} style={INPUT} />
              </div>
              <div style={FIELD}>
                <span style={LABEL}>Where you got it <span style={OPT}>opt</span></span>
                <input type="text" autoCapitalize="words" placeholder="e.g. private party, dealer, gift…" value={data.wherePurchased} onChange={upd('wherePurchased')} style={INPUT} />
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
              <div style={FIELD}>
                <span style={LABEL}>Origin Story <span style={OPT}>opt</span></span>
                <textarea value={data.originStory} onChange={upd('originStory')} rows={4} placeholder="The hunt, the first drive, the reason you kept it." style={{ ...INPUT, resize: 'none', lineHeight: 1.65 } as React.CSSProperties} />
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: `${SPACE_XS}px 0` }} />
              <span style={{ ...LABEL, opacity: 0.4 }}>Public Profile</span>
              <PrivacyRow
                title="Share this build publicly"
                sub="Anyone with the link can visit this car's public page."
                on={privacy.isPublic}
                onChange={() => setPrivacy(p => ({ ...p, isPublic: !p.isPublic }))}
              />
              <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: `2px 0` }} />
              <PrivacyRow
                title="Build Sheet"
                sub="Your mods & specs."
                on={privacy.buildsheet}
                disabled={!privacy.isPublic}
                onChange={() => setPrivacy(p => ({ ...p, buildsheet: !p.buildsheet }))}
              />
              <PrivacyRow
                title="Timeline"
                sub="Your build history."
                on={privacy.timeline}
                disabled={!privacy.isPublic}
                onChange={() => setPrivacy(p => ({ ...p, timeline: !p.timeline }))}
              />
              <PrivacyRow
                title="Featured"
                sub="Your magazine feature."
                on={privacy.featured}
                disabled={!privacy.isPublic}
                onChange={() => setPrivacy(p => ({ ...p, featured: !p.featured }))}
              />
            </div>
            {err && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_SM }}>{err}</p>}
            <div style={{ height: SPACE_MD }} />
          </div>

          <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(5,5,7,0.96)', display: 'flex', flexDirection: 'column', gap: SPACE_SM, position: 'relative', zIndex: 5 }}>
            <button disabled={saving} onClick={save} style={ctaStyle}>{saving ? 'Saving…' : 'Save Changes'}</button>
            <button onClick={() => setConfirmDelete(true)} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'rgba(224,85,85,0.65)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Remove Car
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE_LG}px`, position: 'relative', zIndex: 1 }}>
            <p style={{ fontFamily: FONT_TITLE, fontStyle: 'italic', fontWeight: 600, fontSize: 26, color: COLOR_HEADER_TITLE, margin: '0 0 12px', textAlign: 'center', lineHeight: 1.2 }}>Remove this car?</p>
            <p style={{ fontFamily: FONT_UI, fontWeight: 500, fontSize: 13, color: 'rgba(245,245,245,0.45)', textAlign: 'center', lineHeight: 1.6, margin: 0, maxWidth: 260 }}>
              It'll be held for 7 days before permanent deletion. You can restore it from your profile.
            </p>
            {err && <p style={{ fontFamily: FONT_UI, fontSize: 12, color: '#e05555', marginTop: SPACE_MD }}>{err}</p>}
          </div>
          <div style={{ flexShrink: 0, padding: `${SPACE_SM}px ${SPACE_MD}px ${SPACE_LG}px`, display: 'flex', flexDirection: 'column', gap: SPACE_SM, position: 'relative', zIndex: 5 }}>
            <button disabled={saving} onClick={removeCar} style={{ ...ctaStyle, background: '#c0392b' }}>{saving ? 'Removing…' : 'Yes, Remove It'}</button>
            <button onClick={() => setConfirmDelete(false)} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'rgba(245,245,245,0.45)', fontFamily: FONT_UI, fontWeight: 700, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Keep It</button>
          </div>
        </>
      )}
    </div>
  )
}
